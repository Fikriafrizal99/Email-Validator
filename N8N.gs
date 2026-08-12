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

  const state = {
    runId: runId,
    mode: 'PENDING',
    nextRow: EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
    endRow: endRow,
    startedAt: new Date().toISOString(),
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
