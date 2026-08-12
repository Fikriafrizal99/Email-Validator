/**
 * N8N ADAPTER UNTUK EMAIL VALIDATOR
 * Jalur: n8n -> Google OAuth2 -> Apps Script API (scripts.run)
 *
 * Fungsi publik untuk n8n:
 * - startEmailValidatorN8n(spreadsheetId)
 * - getEmailValidatorStatusN8n()
 *
 * Catatan:
 * - Tidak memakai doGet/doPost atau shared secret.
 * - Autentikasi ditangani Google OAuth2.
 * - Engine Email Validator utama tetap menggunakan batch/trigger yang sudah ada.
 */

const N8N_LAST_RUN_ID_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_RUN_ID';
const N8N_LAST_SPREADSHEET_ID_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_SPREADSHEET_ID';
const N8N_LAST_RESULT_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_RESULT';
const N8N_LAST_STARTED_AT_PROPERTY_ = 'N8N_EMAIL_VALIDATOR_LAST_STARTED_AT';

/**
 * Memulai validasi seluruh email baru dari n8n.
 * Wajib menerima Spreadsheet ID karena Apps Script API tidak memiliki active spreadsheet.
 */
function startEmailValidatorN8n(spreadsheetId) {
  assertValidatorApiKey_();

  const id = cleanText_(spreadsheetId);
  if (!id) {
    throw new Error('Spreadsheet ID wajib dikirim dari n8n.');
  }

  const props = PropertiesService.getScriptProperties();
  const existingStateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  const existingRunId = cleanText_(
    props.getProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY)
  );

  // Jangan timpa run yang masih aktif bila tombol/workflow terpanggil dua kali.
  if (existingStateText && existingRunId) {
    try {
      const existingState = JSON.parse(existingStateText);
      if (cleanText_(existingState.runId) === existingRunId && isBatchRunActive_(existingRunId)) {
        return buildN8nStatusFromState_(existingState, 'RUNNING');
      }
    } catch (ignore) {
      // State rusak akan dibersihkan oleh start baru di bawah.
    }
  }

  const ss = SpreadsheetApp.openById(id);
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!sourceSheet) {
    throw new Error('Sheet "Job Board" tidak ditemukan.');
  }

  const headerMap = getHeaderMap_(sourceSheet);
  requireHeader_(headerMap, 'Company Name');
  requireHeader_(headerMap, 'Contact Type');
  requireHeader_(headerMap, 'Contact');
  ensureWorkspace_(ss);

  const endRow = getLastValidationDataRow_(sourceSheet, headerMap);
  const runId = Utilities.getUuid();

  deleteValidatorContinuationTriggers_();
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);
  props.deleteProperty(N8N_LAST_RESULT_PROPERTY_);
  props.setProperty(N8N_LAST_RUN_ID_PROPERTY_, runId);
  props.setProperty(N8N_LAST_SPREADSHEET_ID_PROPERTY_, id);

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
      finishedAt: new Date().toISOString()
    };
    props.setProperty(N8N_LAST_RESULT_PROPERTY_, JSON.stringify(emptyResult));
    return emptyResult;
  }

  const startedAt = new Date().toISOString();
  props.setProperty(N8N_LAST_STARTED_AT_PROPERTY_, startedAt);

  const state = {
    runId: runId,
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

  // Jalankan batch pertama sekarang; batch berikutnya tetap diteruskan oleh trigger engine utama.
  processEmailValidatorBatch();

  return getEmailValidatorStatusN8n();
}

/**
 * Mengembalikan status batch yang dibaca oleh polling n8n.
 */
function getEmailValidatorStatusN8n() {
  const props = PropertiesService.getScriptProperties();
  const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  const lastError = cleanText_(props.getProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY));
  const lastRunId = cleanText_(props.getProperty(N8N_LAST_RUN_ID_PROPERTY_));
  const lastSpreadsheetId = cleanText_(props.getProperty(N8N_LAST_SPREADSHEET_ID_PROPERTY_));
  const lastStartedAt = cleanText_(props.getProperty(N8N_LAST_STARTED_AT_PROPERTY_));

  if (stateText) {
    try {
      const state = JSON.parse(stateText);
      const result = buildN8nStatusFromState_(state, 'RUNNING');

      // Simpan snapshot terakhir agar ketika finishValidationBatch_ menghapus state,
      // n8n masih mendapatkan statistik terakhir yang sempat terbaca.
      props.setProperty(N8N_LAST_RESULT_PROPERTY_, JSON.stringify(result));
      return result;
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

  // Jika batch state sudah dihapus oleh finishValidationBatch_, hitung hasil akhir
  // dari Raw berdasarkan Last Checked sejak waktu run dimulai. Dengan begitu
  // statistik final tetap akurat tanpa mengubah engine utama.
  if (lastRunId && lastSpreadsheetId && lastStartedAt) {
    try {
      const finalResult = buildN8nFinalStatusFromRaw_(
        lastSpreadsheetId,
        lastRunId,
        lastStartedAt
      );
      props.setProperty(N8N_LAST_RESULT_PROPERTY_, JSON.stringify(finalResult));
      return finalResult;
    } catch (error) {
      // Jika pembacaan Raw gagal, fallback ke snapshot polling terakhir.
      console.warn(getErrorMessage_(error));
    }
  }

  const lastResultText = props.getProperty(N8N_LAST_RESULT_PROPERTY_);
  if (lastResultText) {
    try {
      const lastResult = JSON.parse(lastResultText);
      lastResult.ok = true;
      lastResult.runId = cleanText_(lastResult.runId) || lastRunId;
      lastResult.status = 'DONE';
      lastResult.finishedAt = lastResult.finishedAt || new Date().toISOString();
      return lastResult;
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

function buildN8nFinalStatusFromRaw_(spreadsheetId, runId, startedAt) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const rawSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.RAW_SHEET_NAME);
  if (!rawSheet || rawSheet.getLastRow() < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) {
    return {
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
      startedAt: startedAt,
      finishedAt: new Date().toISOString()
    };
  }

  const map = getHeaderMap_(rawSheet);
  const statusCol = requireHeader_(map, 'Validation Status');
  const checkedCol = requireHeader_(map, 'Last Checked');
  const rowCount = rawSheet.getLastRow() - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1;
  const rows = rawSheet.getRange(
    EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
    1,
    rowCount,
    rawSheet.getLastColumn()
  ).getValues();

  const startedMs = new Date(startedAt).getTime();
  const result = {
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
    startedAt: startedAt,
    finishedAt: new Date().toISOString()
  };

  rows.forEach(function (row) {
    const checkedValue = row[checkedCol - 1];
    const checkedMs = checkedValue instanceof Date
      ? checkedValue.getTime()
      : new Date(checkedValue).getTime();
    if (!isFinite(checkedMs) || !isFinite(startedMs) || checkedMs < startedMs) return;

    const technicalStatus = cleanText_(row[statusCol - 1]).toUpperCase();
    if (!technicalStatus) return;

    result.processed++;
    if (technicalStatus === 'ERROR') result.errors++;

    const friendly = mapFinalStatus_(technicalStatus);
    if (friendly === 'TERVERIFIKASI') result.validConfirmed++;
    else if (friendly === 'KEMUNGKINAN VALID') result.validProbable++;
    else if (friendly === 'CEK MANUAL') result.review++;
    else if (friendly === 'JANGAN DIGUNAKAN') result.invalid++;
  });

  return result;
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
