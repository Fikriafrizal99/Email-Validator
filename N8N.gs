/**
 * N8N ADAPTER UNTUK EMAIL VALIDATOR
 * Jalur: n8n -> Google OAuth2 -> Apps Script API (scripts.run)
 *
 * Fungsi publik untuk n8n:
 * - startEmailValidatorN8n(spreadsheetId)
 * - continueEmailValidatorN8n()
 * - getEmailValidatorStatusN8n()
 *
 * Catatan:
 * - Tidak memakai doGet/doPost atau shared secret.
 * - Autentikasi ditangani Google OAuth2.
 * - n8n menjadi orchestrator batch: setiap polling memproses maksimal BATCH_SIZE.
 * - Adapter ini sengaja tidak membuat Apps Script trigger dari scripts.run.
 * - Engine validasi utama tetap memakai helper yang sama dengan Kode.gs.
 */

const N8N_LAST_RUN_ID_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_RUN_ID';
const N8N_LAST_SPREADSHEET_ID_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_SPREADSHEET_ID';
const N8N_LAST_RESULT_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_RESULT';
const N8N_LAST_STARTED_AT_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_STARTED_AT';

/**
 * Memulai validasi seluruh email baru dari n8n.
 * Spreadsheet ID wajib dikirim karena scripts.run tidak memiliki active spreadsheet.
 */
function startEmailValidatorN8n(spreadsheetId) {
  assertValidatorApiKey_();

  const id = cleanText_(spreadsheetId);
  if (!id) throw new Error('Spreadsheet ID wajib dikirim dari n8n.');

  const props = PropertiesService.getScriptProperties();
  const existingStateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  const existingRunId = cleanText_(
    props.getProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY)
  );

  if (existingStateText && existingRunId) {
    try {
      const existingState = JSON.parse(existingStateText);
      if (cleanText_(existingState.runId) === existingRunId && isBatchRunActive_(existingRunId)) {
        if (cleanText_(existingState.controller).toUpperCase() !== 'N8N') {
          throw new Error('Ada proses Email Validator non-n8n yang masih aktif. Hentikan atau tunggu sampai selesai.');
        }
        return buildN8nStatusFromState_(existingState, 'RUNNING');
      }
    } catch (error) {
      if (/non-n8n/i.test(getErrorMessage_(error))) throw error;
    }
  }

  const ss = SpreadsheetApp.openById(id);
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!sourceSheet) throw new Error('Sheet "Job Board" tidak ditemukan.');

  const headerMap = getHeaderMap_(sourceSheet);
  requireHeader_(headerMap, 'Company Name');
  requireHeader_(headerMap, 'Contact Type');
  requireHeader_(headerMap, 'Contact');
  ensureWorkspace_(ss);

  const endRow = getLastValidationDataRow_(sourceSheet, headerMap);
  const runId = Utilities.getUuid();
  const startedAt = new Date().toISOString();

  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);
  props.deleteProperty(N8N_LAST_RESULT_PROPERTY_);
  props.setProperty(N8N_LAST_RUN_ID_PROPERTY_, runId);
  props.setProperty(N8N_LAST_SPREADSHEET_ID_PROPERTY_, id);
  props.setProperty(N8N_LAST_STARTED_AT_PROPERTY_, startedAt);

  if (endRow < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) {
    const emptyResult = {
      ok: true,
      runId: runId,
      status: 'DONE',
      processed: 0,
      skipped: 0,
      validConfirmed: 0,
      validProbable: 0,
      review: 0,
      invalid: 0,
      errors: 0,
      message: 'Tidak ada data email yang perlu dipindai.',
      startedAt: startedAt,
      finishedAt: new Date().toISOString()
    };
    props.setProperty(N8N_LAST_RESULT_PROPERTY_, JSON.stringify(emptyResult));
    return emptyResult;
  }

  const state = {
    runId: runId,
    controller: 'N8N',
    mode: 'PENDING',
    nextRow: EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
    endRow: endRow,
    startedAt: startedAt,
    processed: 0,
    skipped: 0,
    verified: 0,
    probable: 0,
    manual: 0,
    blocked: 0,
    errors: 0
  };

  props.setProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY, runId);
  props.setProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY, id);
  props.setProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY, JSON.stringify(state));

  processEmailValidatorN8nBatch_();
  return getEmailValidatorStatusN8n();
}

/**
 * Dipanggil n8n setelah Wait. Memproses satu batch berikutnya lalu mengembalikan status.
 */
function continueEmailValidatorN8n() {
  const props = PropertiesService.getScriptProperties();
  const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);

  if (!stateText) return getEmailValidatorStatusN8n();

  const state = JSON.parse(stateText);
  if (cleanText_(state.controller).toUpperCase() !== 'N8N') {
    throw new Error('Batch aktif bukan batch yang dikendalikan n8n.');
  }

  processEmailValidatorN8nBatch_();
  return getEmailValidatorStatusN8n();
}

/**
 * Status read-only. Tidak memproses batch baru.
 */
function getEmailValidatorStatusN8n() {
  const props = PropertiesService.getScriptProperties();
  const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  const lastError = cleanText_(props.getProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY));
  const lastRunId = cleanText_(props.getProperty(N8N_LAST_RUN_ID_PROPERTY_));

  if (stateText) {
    try {
      const state = JSON.parse(stateText);
      return buildN8nStatusFromState_(state, 'RUNNING');
    } catch (error) {
      return {
        ok: false,
        runId: lastRunId,
        status: 'ERROR',
        error: 'Batch state tidak dapat dibaca: ' + getErrorMessage_(error)
      };
    }
  }

  if (lastError) {
    return {
      ok: false,
      runId: lastRunId,
      status: 'ERROR',
      error: lastError
    };
  }

  const lastResultText = props.getProperty(N8N_LAST_RESULT_PROPERTY_);
  if (lastResultText) {
    try {
      return JSON.parse(lastResultText);
    } catch (ignore) {
      // fallback di bawah
    }
  }

  return {
    ok: true,
    runId: lastRunId,
    status: lastRunId ? 'DONE' : 'IDLE',
    processed: 0,
    skipped: 0,
    validConfirmed: 0,
    validProbable: 0,
    review: 0,
    invalid: 0,
    errors: 0
  };
}

/**
 * Versi satu-batch untuk eksekusi melalui Apps Script API.
 * Tidak membuat continuation trigger; continuation dilakukan oleh n8n.
 */
function processEmailValidatorN8nBatch_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Email Validator sedang diproses oleh eksekusi lain. Coba lagi pada polling berikutnya.');
  }

  var runId = '';

  try {
    const props = PropertiesService.getScriptProperties();
    const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
    if (!stateText) return;

    const state = JSON.parse(stateText);
    runId = cleanText_(state.runId);

    if (cleanText_(state.controller).toUpperCase() !== 'N8N') {
      throw new Error('Batch aktif bukan batch yang dikendalikan n8n.');
    }

    assertBatchRunActive_(runId);
    assertValidatorApiKey_();

    const spreadsheetId = props.getProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
    if (!spreadsheetId) throw new Error('Spreadsheet ID proses tidak tersedia.');

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
    if (!sourceSheet) throw new Error('Sheet "Job Board" tidak ditemukan.');

    ensureWorkspace_(ss);

    const rawIndex = loadRawIndex_(ensureRawSheet_(ss));
    const sourceHeaderMap = getHeaderMap_(sourceSheet);
    requireHeader_(sourceHeaderMap, 'Company Name');
    requireHeader_(sourceHeaderMap, 'Contact Type');
    requireHeader_(sourceHeaderMap, 'Contact');

    const liveLastDataRow = getLastValidationDataRow_(sourceSheet, sourceHeaderMap);
    const fixedEndRow = Number(state.endRow) || liveLastDataRow;
    const lastRow = Math.min(fixedEndRow, liveLastDataRow);

    if (lastRow < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW || state.nextRow > lastRow) {
      finishEmailValidatorN8nBatch_(ss, state);
      return;
    }

    const values = sourceSheet.getRange(
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
      1,
      lastRow - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1,
      sourceSheet.getLastColumn()
    ).getDisplayValues();

    const rowsToProcess = [];
    var scanRow = Math.max(
      Number(state.nextRow) || EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW
    );

    while (scanRow <= lastRow && rowsToProcess.length < EMAIL_VALIDATOR_CONFIG.BATCH_SIZE) {
      assertBatchRunActive_(runId);
      const rowValues = values[scanRow - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW];
      if (shouldProcessValidationRow_(scanRow, rowValues, sourceHeaderMap, rawIndex, state.mode)) {
        rowsToProcess.push(scanRow);
      } else {
        state.skipped++;
      }
      scanRow++;
    }

    if (rowsToProcess.length) {
      const summary = processExplicitValidationRows_(
        ss,
        sourceSheet,
        rowsToProcess,
        state.mode === 'RETRY',
        runId
      );

      if (summary.stopped) {
        deleteBatchStateIfRunMatches_(runId);
        return;
      }

      state.processed += summary.processed;
      state.skipped += summary.skipped;
      state.verified += summary.verified;
      state.probable += summary.probable;
      state.manual += summary.manual;
      state.blocked += summary.blocked;
      state.errors += summary.errors;
    }

    assertBatchRunActive_(runId);
    state.nextRow = scanRow;

    if (scanRow > lastRow) {
      finishEmailValidatorN8nBatch_(ss, state);
      return;
    }

    if (!persistBatchStateIfActive_(state)) return;
    updateSummarySheet_(ss);
  } catch (error) {
    if (isBatchStoppedError_(error)) {
      deleteBatchStateIfRunMatches_(runId);
      return;
    }

    if (runId && !isBatchRunActive_(runId)) return;

    const props = PropertiesService.getScriptProperties();
    props.setProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY, getErrorMessage_(error));
    clearBatchRunIfMatches_(runId);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function finishEmailValidatorN8nBatch_(ss, state) {
  const runId = cleanText_(state && state.runId);
  if (runId && !isBatchRunActive_(runId)) {
    deleteBatchStateIfRunMatches_(runId);
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const result = buildN8nStatusFromState_(state, 'DONE');
  result.finishedAt = new Date().toISOString();

  props.setProperty(N8N_LAST_RUN_ID_PROPERTY_, runId);
  props.setProperty(N8N_LAST_RESULT_PROPERTY_, JSON.stringify(result));
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);

  if (!runId || isBatchRunActive_(runId)) {
    props.deleteProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY);
  }

  updateSummarySheet_(ss);
}

function buildN8nStatusFromState_(state, status) {
  return {
    ok: true,
    runId: cleanText_(state && state.runId),
    status: status || 'RUNNING',
    processed: Number(state && state.processed || 0),
    skipped: Number(state && state.skipped || 0),
    validConfirmed: Number(state && state.verified || 0),
    validProbable: Number(state && state.probable || 0),
    review: Number(state && state.manual || 0),
    invalid: Number(state && state.blocked || 0),
    errors: Number(state && state.errors || 0),
    nextRow: Number(state && state.nextRow || 0),
    endRow: Number(state && state.endRow || 0),
    startedAt: cleanText_(state && state.startedAt)
  };
}
