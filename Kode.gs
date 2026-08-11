/**
 * EMAIL VALIDATOR UNTUK GOOGLE SHEETS
 * Versi: 3.3.5 - official root resolver + legal entity/AHU evidence
 *
 * Sumber data : sheet "Job Board"
 * Header wajib: "Company Name", "Contact Type", "Contact"
 *
 * Sheet yang dibuat:
 * - Ringkasan Validasi     : dashboard sederhana dan panduan membaca hasil.
 * - Email Review           : tampilan kerja utama yang ringkas untuk keputusan cepat.
 * - Email Evidence         : detail investigasi Web, LinkedIn, Instagram, AHU, dan bukti publik.
 * - Company Master         : database perusahaan agar OpenAI Web Search tidak mencari perusahaan yang sama berulang kali.
 * - Email Validation Raw   : database teknis/audit trail lengkap; disembunyikan secara default.
 *
 * Catatan migrasi tampilan:
 * - Sheet lama "Email Review Detail" tidak dihapus. Jika ditemukan, sheet tersebut diarsipkan
 *   menjadi "Email Review Detail (Legacy)" dan disembunyikan.
 * - Data Review dan Evidence dapat dibangun ulang dari Email Validation Raw tanpa web search baru.
 *
 * Prinsip cache:
 * - Data perusahaan disimpan 90 hari berdasarkan nama perusahaan yang dinormalisasi.
 * - Hasil email disimpan 30 hari berdasarkan kombinasi perusahaan + email.
 * - Perusahaan sama dengan email berbeda menggunakan Company Master dan hanya mencari bukti email spesifik.
 * - Perusahaan dan email yang sama menggunakan cache penuh dan tidak memanggil OpenAI Web Search lagi.
 */

const EMAIL_VALIDATOR_CONFIG = Object.freeze({
  VERSION: '3.3.5',
  CACHE_COMPATIBLE_VERSIONS: ['3.2.0', '3.3.0', '3.3.2', '3.3.3', '3.3.4', '3.3.5'],
  COMPANY_CACHE_COMPATIBLE_VERSIONS: ['3.3.5'],
  JOB_SHEET_NAME: 'Job Board',
  SUMMARY_SHEET_NAME: 'Ringkasan Validasi',
  REVIEW_SHEET_NAME: 'Email Review',
  EVIDENCE_SHEET_NAME: 'Email Evidence',
  LEGACY_REVIEW_SHEET_NAME: 'Email Review Detail',
  LEGACY_REVIEW_ARCHIVE_SHEET_NAME: 'Email Review Detail (Legacy)',
  COMPANY_SHEET_NAME: 'Company Master',
  RAW_SHEET_NAME: 'Email Validation Raw',
  LEGACY_SHEET_NAME: 'Email Validation Result',
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  BATCH_SIZE: 5,
  CONTINUE_AFTER_MS: 60 * 1000,
  REQUEST_DELAY_MS: 550,
  MAX_SEARCH_RESULTS: 10,
  MAX_PAGES_TO_INSPECT: 5,
  OPENAI_MODEL: 'gpt-5.6-luna',
  OPENAI_SEARCH_CONTEXT_SIZE: 'medium',
  OPENAI_FETCH_MAX_ATTEMPTS: 3,
  OPENAI_FETCH_BASE_DELAY_MS: 1000,
  OPENAI_FETCH_MAX_DELAY_MS: 10000,
  EMAIL_CACHE_MAX_AGE_DAYS: 30,
  COMPANY_CACHE_MAX_AGE_DAYS: 90,
  API_KEY_PROPERTY: 'OPENAI_API_KEY',
  ACTIVE_RUN_ID_PROPERTY: 'EMAIL_VALIDATOR_ACTIVE_RUN_ID_V4',
  BATCH_STATE_PROPERTY: 'EMAIL_VALIDATOR_BATCH_STATE_V4',
  SPREADSHEET_ID_PROPERTY: 'EMAIL_VALIDATOR_SPREADSHEET_ID_V4',
  LAST_ERROR_PROPERTY: 'EMAIL_VALIDATOR_LAST_ERROR_V4',
  COMPANY_CACHE_INVALIDATION_PROPERTY: 'EMAIL_VALIDATOR_COMPANY_CACHE_INVALIDATED_V335',
  SEARCH_ADAPTER_CACHE_INVALIDATION_PROPERTY: 'EMAIL_VALIDATOR_SEARCH_ADAPTER_CACHE_INVALIDATED_V335_FIX1',
  CONTINUE_HANDLER: 'processEmailValidatorBatch',
  SOURCE_HEADERS_TO_COPY: [
    'Verification Date', 'No', 'Team', 'Position',
    'Company Name', 'Contact Type', 'Contact'
  ],
  REVIEW_HEADERS: [
    'Source Row',
    'No', 'Team', 'Position', 'Company Name', 'Email',
    'Final Status', 'Recommended Action',
    'Email Format', 'Domain MX', 'Domain Match', 'Exact Email Found',
    'Company Presence Status', 'Validation Score',
    'Evidence Type', 'Validation Notes', 'Last Checked'
  ],
  EVIDENCE_HEADERS: [
    'Source Row', 'Company Name', 'Email', 'Final Status',
    'Official Website', 'Website Match', 'Email on Website', 'Website Evidence',
    'LinkedIn Company', 'LinkedIn Match', 'Email on LinkedIn', 'LinkedIn Evidence',
    'Instagram', 'Instagram Match', 'Email on Instagram', 'Instagram Evidence',
    'AHU Status', 'AHU Registered Name', 'AHU Evidence',
    'Other Email Evidence',
    'AHU Number', 'Legal Entity Name', 'Legal Relationship',
    'Legal Evidence Source', 'Legal Confidence', 'Entity Type'
  ],
  COMPANY_HEADERS: [
    'Company Key', 'Company Name', 'Company Alias', 'Location',
    'Official Website', 'Official Domain', 'Official Domain Stem',
    'LinkedIn', 'LinkedIn Match', 'Instagram', 'Instagram Match',
    'AHU Status', 'AHU Registered Name', 'AHU Legal Form',
    'AHU Parent Entity', 'AHU Evidence', 'Company Status', 'Data Source',
    'Validator Version', 'Last Checked', 'Manual Lock', 'Notes',
    'Entity Type', 'Legal Entity Name', 'Legal Entity Type',
    'Legal Relationship', 'AHU Number', 'Legal Evidence Source', 'Legal Confidence'
  ],
  RAW_HEADERS: [
    'Source Row', 'Verification Date', 'No', 'Team', 'Position',
    'Company Name', 'Contact Type', 'Email', 'Email Domain',
    'Email Format', 'Domain MX',
    'Official Website', 'Website Match',
    'LinkedIn Company', 'LinkedIn Match',
    'Instagram', 'Instagram Match',
    'AHU Status', 'AHU Registered Name', 'AHU Evidence',
    'Company Presence Score', 'Company Presence Status', 'Official Domain',
    'Domain Match', 'Exact Email Found',
    'Company Matched', 'Other Company Suspected',
    'Evidence Type', 'Evidence Source',
    'Email on Website', 'Website Evidence',
    'Email on LinkedIn', 'LinkedIn Evidence',
    'Email on Instagram', 'Instagram Evidence',
    'Other Email Evidence',
    'Validation Score', 'Validation Status', 'Validation Notes',
    'Company Data Source', 'Email Data Source',
    'Validator Version', 'Last Checked',
    'Entity Type', 'Legal Entity Name', 'Legal Entity Type',
    'Legal Relationship', 'AHU Number', 'Legal Evidence Source', 'Legal Confidence'
  ]
});

const FREE_EMAIL_DOMAINS_ = Object.freeze([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.id',
  'outlook.com', 'hotmail.com', 'live.com', 'icloud.com',
  'aol.com', 'proton.me', 'protonmail.com', 'ymail.com'
]);

const BLOCKED_OFFICIAL_DOMAINS_ = Object.freeze([
  'linkedin.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com',
  'jobstreet.co.id', 'jobstreet.com', 'glints.com', 'kalibrr.com', 'indeed.com',
  'dealls.com', 'loker.id', 'kitalulus.com', 'karir.com', 'jobs.id',
  'google.com', 'googleusercontent.com', 'blogspot.com', 'wordpress.com',
  'wixsite.com', 'x.com', 'twitter.com', 'telegram.me', 't.me',
  'trip.com', 'traveloka.com', 'agoda.com', 'booking.com', 'expedia.com',
  'zomato.com', 'pergikuliner.com', 'restaurantguru.com', 'foursquare.com',
  'yelp.com', 'yellowpages.co.id', 'gofood.co.id', 'grab.com', 'shopee.co.id',
  'tokopedia.com', 'semuabis.com', 'cybo.com', 'idalamat.com', 'carilokasi.com'
]);

// Alias institusi yang sering muncul di sumber publik Indonesia. Alias hanya
// memperluas pencarian; hasil tetap harus melewati matcher identitas dan bukti
// domain/konteks sebelum disimpan sebagai MATCH.
const COMPANY_ALIAS_GROUPS_ = Object.freeze([
  {
    canonicalName: 'Universitas Muhammadiyah Malang',
    aliases: ['UMM', 'Universitas Muhammadiyah Malang', 'University of Muhammadiyah Malang'],
    domainStems: ['umm']
  },
  {
    canonicalName: 'Universitas Muhammadiyah Metro',
    aliases: ['UM Metro', 'UMM Metro', 'Universitas Muhammadiyah Metro', 'Muhammadiyah Metro'],
    domainStems: ['ummetro', 'um-metro', 'um_metro']
  }
]);

const AHU_LEGAL_FORM_TERMS_ = Object.freeze([
  'PT', 'CV', 'TBK', 'PERUM', 'BUMN', 'BUMD', 'YAYASAN', 'PERKUMPULAN',
  'KOPERASI', 'PERSYARIKATAN', 'ORGANISASI', 'BADAN HUKUM',
  'PERSEROAN TERBATAS', 'PERUSAHAAN UMUM'
]);

const ENTITY_TYPES_ = Object.freeze([
  'COMPANY', 'UNIVERSITY', 'SCHOOL', 'FOUNDATION', 'ASSOCIATION',
  'COOPERATIVE', 'GOVERNMENT', 'HOSPITAL', 'CLINIC', 'ORGANIZATION', 'OTHER'
]);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Email Validator')
    .addItem('1. Siapkan & rapikan sheet', 'prepareEmailValidatorWorkspace')
    .addItem('2. Simpan OpenAI API Key', 'setupValidatorOpenAIApiKey')
    .addItem('3. Uji koneksi', 'testEmailValidatorConnection')
    .addSeparator()
    .addItem('Migrasi hasil v2.1 tanpa pencarian baru', 'migrateLegacyValidationResults')
    .addItem('Bangun ulang Review + Evidence dari Raw', 'rebuildReviewFromRaw')
    .addSeparator()
    .addItem('Validasi email baris terpilih', 'validateSelectedEmailRows')
    .addItem('Validasi semua email baru', 'startValidateAllEmails')
    .addItem('Validasi ulang yang perlu dicek', 'startRetryReviewEmails')
    .addItem('Refresh perusahaan terpilih', 'refreshSelectedCompanies')
    .addSeparator()
    .addItem('Buka Ringkasan', 'openValidationSummary')
    .addItem('Buka Email Review', 'openEmailReview')
    .addItem('Buka Email Evidence', 'openEmailEvidence')
    .addItem('Buka Company Master', 'openCompanyMaster')
    .addSeparator()
    .addItem('Hentikan proses otomatis', 'stopEmailValidatorBatch')
    .addItem('Lihat status proses', 'showEmailValidatorStatus')
    .addToUi();
}

function prepareEmailValidatorWorkspace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  archiveLegacyReviewSheet_(ss);
  ensureReviewSheet_(ss);
  ensureEvidenceSheet_(ss);
  ensureCompanyMasterSheet_(ss);
  ensureRawSheet_(ss);
  ensureSummarySheet_(ss);
  rebuildViewsFromRaw_(ss);
  updateSummarySheet_(ss);
  ss.setActiveSheet(ensureReviewSheet_(ss));
  ss.toast('Workspace siap: Review ringkas, Evidence detail, dan Raw audit trail.', 'Email Validator', 8);
}

function openValidationSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  updateSummarySheet_(ss);
  ss.setActiveSheet(ensureSummarySheet_(ss));
}

function openEmailReview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ensureReviewSheet_(ss));
}

function openEmailEvidence() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ensureEvidenceSheet_(ss));
}

function openCompanyMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ensureCompanyMasterSheet_(ss));
}

function setupValidatorOpenAIApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Simpan OpenAI API Key',
    'Masukkan OpenAI API key. Key disimpan di Script Properties, bukan di sel spreadsheet.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const apiKey = cleanText_(response.getResponseText());
  if (!apiKey) {
    ui.alert('API key tidak boleh kosong.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(EMAIL_VALIDATOR_CONFIG.API_KEY_PROPERTY, apiKey);
  ui.alert('OpenAI API key berhasil disimpan. Lanjutkan dengan menu "Uji koneksi".');
}

// Alias sementara agar pemanggilan lama tidak langsung rusak setelah upgrade.
function setupValidatorBraveApiKey() {
  setupValidatorOpenAIApiKey();
}

function testEmailValidatorConnection() {
  try {
    const searchResults = openAIWebSearch_('OpenAI official website');
    const mx = lookupMx_('gmail.com');
    SpreadsheetApp.getUi().alert(
      'Koneksi berhasil',
      'OpenAI Web Search: ' + searchResults.length + ' hasil\nDNS/MX: ' + (mx.hasMx ? 'aktif' : 'tidak terbaca'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert('Koneksi gagal', getErrorMessage_(error), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function validateSelectedEmailRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  if (sourceSheet.getName() !== EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('Buka sheet "Job Board" lalu pilih baris yang ingin divalidasi.');
    return;
  }

  assertValidatorApiKey_();
  ensureWorkspace_(ss);
  const range = sourceSheet.getActiveRange();
  if (!range) return;

  const startRow = Math.max(range.getRow(), EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW);
  const endRow = Math.max(startRow, range.getLastRow());
  const rows = [];
  for (var row = startRow; row <= endRow; row++) rows.push(row);

  const summary = processExplicitValidationRows_(ss, sourceSheet, rows, true);
  updateSummarySheet_(ss);
  ss.toast(
    summary.processed + ' email diproses, ' + summary.skipped + ' baris dilewati.',
    'Email Validator',
    8
  );
}

function startValidateAllEmails() {
  startValidationBatch_('PENDING');
}

function startRetryReviewEmails() {
  startValidationBatch_('RETRY');
}

function startValidationBatch_(mode) {
  assertValidatorApiKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!sourceSheet) throw new Error('Sheet "Job Board" tidak ditemukan.');

  const headerMap = getHeaderMap_(sourceSheet);
  requireHeader_(headerMap, 'Company Name');
  requireHeader_(headerMap, 'Contact Type');
  requireHeader_(headerMap, 'Contact');
  ensureWorkspace_(ss);

  // Boundary dibuat saat START. Baris yang ditambahkan setelah proses dimulai
  // tidak akan ikut terseret ke run yang sedang aktif.
  const endRow = getLastValidationDataRow_(sourceSheet, headerMap);
  if (endRow < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) {
    ss.toast('Tidak ada data email yang perlu dipindai.', 'Email Validator', 6);
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const runId = Utilities.getUuid();
  deleteValidatorContinuationTriggers_();
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);
  props.setProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY, runId);
  props.setProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY, ss.getId());
  props.setProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY, JSON.stringify({
    runId: runId,
    mode: mode,
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
  }));

  ss.toast(
    'Proses dimulai sampai row ' + endRow + '. Sistem memproses maksimal ' +
      EMAIL_VALIDATOR_CONFIG.BATCH_SIZE + ' email per batch.',
    'Email Validator', 7
  );
  processEmailValidatorBatch();
}

function processEmailValidatorBatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    // Jika run baru dimulai saat batch lama masih memegang lock, jangan biarkan
    // state baru terlantar tanpa continuation trigger.
    try {
      const props = PropertiesService.getScriptProperties();
      const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
      if (stateText) {
        const pendingState = JSON.parse(stateText);
        const pendingRunId = cleanText_(pendingState.runId);
        if (pendingRunId && isBatchRunActive_(pendingRunId)) {
          scheduleValidatorContinuation_(pendingRunId);
        }
      }
    } catch (error) { console.warn(getErrorMessage_(error)); }
    return;
  }
  var runId = '';

  try {
    const props = PropertiesService.getScriptProperties();
    const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
    if (!stateText) {
      deleteValidatorContinuationTriggers_();
      return;
    }

    const state = JSON.parse(stateText);
    runId = cleanText_(state.runId);
    assertBatchRunActive_(runId);
    assertValidatorApiKey_();

    const spreadsheetId = props.getProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
    if (!spreadsheetId) throw new Error('Spreadsheet ID proses tidak tersedia.');

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
    if (!sourceSheet) throw new Error('Sheet Job Board tidak ditemukan.');
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
      finishValidationBatch_(ss, state);
      return;
    }

    const values = sourceSheet.getRange(
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
      1,
      lastRow - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1,
      sourceSheet.getLastColumn()
    ).getDisplayValues();

    const rowsToProcess = [];
    var scanRow = Math.max(Number(state.nextRow) || EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW);

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
        ss, sourceSheet, rowsToProcess, state.mode === 'RETRY', runId
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
    if (!persistBatchStateIfActive_(state)) return;

    updateSummarySheet_(ss);
    assertBatchRunActive_(runId);

    if (scanRow > lastRow) finishValidationBatch_(ss, state);
    else scheduleValidatorContinuation_(runId);
  } catch (error) {
    if (isBatchStoppedError_(error)) {
      deleteBatchStateIfRunMatches_(runId);
      return;
    }

    // Run lama tidak boleh mematikan run baru yang mungkin sudah menggantikannya.
    if (runId && !isBatchRunActive_(runId)) return;

    const props = PropertiesService.getScriptProperties();
    const message = getErrorMessage_(error);
    props.setProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY, message);
    clearBatchRunIfMatches_(runId);
    deleteValidatorContinuationTriggers_();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function stopEmailValidatorBatch() {
  const props = PropertiesService.getScriptProperties();

  // ACTIVE_RUN_ID dihapus terlebih dahulu. Batch yang sedang berada di tengah
  // UrlFetch tidak bisa dibatalkan oleh Apps Script, tetapi saat request kembali
  // ia akan melihat run sudah invalid dan tidak boleh menulis state/trigger lagi.
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
  deleteValidatorContinuationTriggers_();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Proses dihentikan. Batch aktif tidak akan dijadwalkan kembali.',
    'Email Validator', 6
  );
}

function showEmailValidatorStatus() {
  const props = PropertiesService.getScriptProperties();
  const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  if (!stateText) {
    const lastError = props.getProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);
    SpreadsheetApp.getUi().alert(lastError
      ? 'Tidak ada proses aktif. Error terakhir: ' + lastError
      : 'Tidak ada proses batch yang sedang aktif.');
    return;
  }

  const state = JSON.parse(stateText);
  if (state.runId && !isBatchRunActive_(state.runId)) {
    deleteBatchStateIfRunMatches_(state.runId);
    deleteValidatorContinuationTriggers_();
    SpreadsheetApp.getUi().alert('Proses sudah dihentikan; state lama dibersihkan.');
    return;
  }
  const message = [
    'Mode: ' + state.mode,
    'Baris berikutnya: ' + state.nextRow,
    'Batas akhir row: ' + (state.endRow || '-'),
    'Diproses: ' + state.processed,
    'Dilewati: ' + state.skipped,
    'Terverifikasi: ' + state.verified,
    'Kemungkinan valid: ' + state.probable,
    'Cek manual: ' + state.manual,
    'Jangan digunakan: ' + state.blocked,
    'Error: ' + state.errors
  ].join('\n');
  SpreadsheetApp.getUi().alert('Status Email Validator', message, SpreadsheetApp.getUi().ButtonSet.OK);
}

function processExplicitValidationRows_(ss, sourceSheet, rows, forceEmailRefresh, runId) {
  const sourceHeaderMap = getHeaderMap_(sourceSheet);
  const companyCol = requireHeader_(sourceHeaderMap, 'Company Name');
  const contactTypeCol = requireHeader_(sourceHeaderMap, 'Contact Type');
  const contactCol = requireHeader_(sourceHeaderMap, 'Contact');

  const rawSheet = ensureRawSheet_(ss);
  const reviewSheet = ensureReviewSheet_(ss);
  const evidenceSheet = ensureEvidenceSheet_(ss);
  const companySheet = ensureCompanyMasterSheet_(ss);
  invalidateEmptyDiscoveryCacheOnce_(companySheet, rawSheet);
  const rawIndex = loadRawIndex_(rawSheet);
  const reviewIndex = loadReviewIndex_(reviewSheet);
  const evidenceIndex = loadReviewIndex_(evidenceSheet);
  const companyIndex = loadCompanyMasterIndex_(companySheet);

  const summary = {
    processed: 0, skipped: 0, verified: 0, probable: 0,
    manual: 0, blocked: 0, errors: 0, stopped: false
  };

  for (var i = 0; i < rows.length; i++) {
    const sourceRow = rows[i];
    try {
      assertBatchRunActive_(runId);

      const sourceValues = sourceSheet
        .getRange(sourceRow, 1, 1, sourceSheet.getLastColumn())
        .getDisplayValues()[0];
      const companyName = cleanText_(sourceValues[companyCol - 1]);
      const contactType = cleanText_(sourceValues[contactTypeCol - 1]).toUpperCase();
      const email = normalizeEmail_(sourceValues[contactCol - 1]);

      if (!companyName || contactType !== 'EMAIL' || !email) {
        summary.skipped++;
        continue;
      }

      const location = buildLocationText_(sourceValues, sourceHeaderMap);
      const validationKey = makeValidationKey_(companyName, email);
      var result;

      const cached = rawIndex.byValidationKey[validationKey];
      if (!forceEmailRefresh && isUsableEmailCache_(cached)) {
        result = copyRawResult_(cached);
        result.emailDataSource = 'EMAIL CACHE';
        result.companyDataSource = 'COMPANY MASTER';
        result.lastChecked = new Date();
      } else {
        result = validateEmailUsingCompanyMaster_(
          companySheet, companyIndex, companyName, email, location, Boolean(forceEmailRefresh), runId
        );
      }

      // Hard-stop checkpoint setelah network/search selesai dan sebelum menulis sheet.
      assertBatchRunActive_(runId);
      upsertRawRow_(rawSheet, rawIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      assertBatchRunActive_(runId);
      upsertReviewRow_(reviewSheet, reviewIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      assertBatchRunActive_(runId);
      upsertEvidenceRow_(evidenceSheet, evidenceIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      summary.processed++;
      incrementFriendlySummary_(summary, mapFinalStatus_(result.status));
    } catch (error) {
      if (isBatchStoppedError_(error)) {
        summary.stopped = true;
        break;
      }
      if (runId && !isBatchRunActive_(runId)) {
        summary.stopped = true;
        break;
      }

      const sourceValues = sourceSheet
        .getRange(sourceRow, 1, 1, sourceSheet.getLastColumn())
        .getDisplayValues()[0];
      const email = normalizeEmail_(sourceValues[contactCol - 1]);
      const result = emptyValidationResult_(email);
      result.status = 'ERROR';
      result.notes = getErrorMessage_(error);
      result.emailDataSource = 'ERROR';
      result.lastChecked = new Date();
      upsertRawRow_(rawSheet, rawIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      upsertReviewRow_(reviewSheet, reviewIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      upsertEvidenceRow_(evidenceSheet, evidenceIndex, sourceRow, sourceValues, sourceHeaderMap, result);
      summary.processed++;
      summary.errors++;
      summary.blocked++;
    }

    Utilities.sleep(EMAIL_VALIDATOR_CONFIG.REQUEST_DELAY_MS);
  }

  return summary;
}

function shouldProcessValidationRow_(sourceRow, rowValues, headerMap, rawIndex, mode) {
  const company = cleanText_(rowValues[headerMap['Company Name'] - 1]);
  const type = cleanText_(rowValues[headerMap['Contact Type'] - 1]).toUpperCase();
  const email = normalizeEmail_(rowValues[headerMap['Contact'] - 1]);
  if (!company || type !== 'EMAIL' || !email) return false;

  const existing = rawIndex.rowsBySourceRow[String(sourceRow)];
  if (!existing) return true;
  if (!isCompatibleValidatorVersion_(existing.validatorVersion)) return true;

  const technicalStatus = cleanText_(existing.status).toUpperCase();
  if (mode === 'RETRY') {
    return /NOT_PUBLICLY_VERIFIED|REVIEW_REQUIRED|MISMATCH_SUSPECTED|INVALID|ERROR/.test(technicalStatus);
  }
  return !technicalStatus || technicalStatus === 'PROCESSING';
}

function validateEmailUsingCompanyMaster_(companySheet, companyIndex, companyName, email, location, forceCompanyRefresh, runId) {
  const result = emptyValidationResult_(email);
  result.lastChecked = new Date();
  result.validatorVersion = EMAIL_VALIDATOR_CONFIG.VERSION;

  result.formatValid = isValidEmailFormat_(email);
  if (!result.formatValid) {
    result.status = 'INVALID_FORMAT';
    result.notes = 'Format alamat email tidak valid.';
    result.emailDataSource = 'FORMAT CHECK';
    return result;
  }

  result.emailDomain = email.split('@')[1].toLowerCase();
  const freeEmail = isFreeEmailDomain_(result.emailDomain);
  assertBatchRunActive_(runId);
  const mx = lookupMx_(result.emailDomain, runId);
  assertBatchRunActive_(runId);
  result.hasMx = mx.hasMx;
  if (!result.hasMx) {
    result.status = 'INVALID_DOMAIN';
    result.score = 10;
    result.notes = 'Domain email tidak memiliki MX yang terbaca.';
    result.emailDataSource = 'MX CHECK';
    return result;
  }

  const companyData = getOrFindCompanyPresence_(
    companySheet, companyIndex, companyName, location, forceCompanyRefresh, runId
  );
  const presence = companyData.presence;
  result.companyDataSource = companyData.source;
  result.officialWebsite = presence.website.url;
  result.websiteMatch = presence.website.status;
  result.officialDomain = presence.website.status === 'MATCH' ? presence.website.domain : '';
  result.linkedinUrl = presence.linkedin.url;
  result.linkedinMatch = presence.linkedin.status;
  result.instagramUrl = presence.instagram.url;
  result.instagramMatch = presence.instagram.status;
  result.ahuStatus = presence.ahu ? (presence.ahu.status || 'NOT_FOUND') : 'NOT_FOUND';
  result.ahuRegisteredName = presence.ahu ? (presence.ahu.registeredName || '') : '';
  result.ahuEvidence = presence.ahu ? (presence.ahu.evidenceUrl || '') : '';
  result.entityType = presence.entityType || resolveEntityType_(companyName, presence.website.url, location);
  result.legalEntityName = presence.ahu ? (presence.ahu.legalEntityName || presence.ahu.registeredName || '') : '';
  result.legalEntityType = presence.ahu ? (presence.ahu.legalEntityType || presence.ahu.legalForm || '') : '';
  result.legalRelationship = presence.ahu ? (presence.ahu.legalRelationship || '') : '';
  result.ahuNumber = presence.ahu ? (presence.ahu.ahuNumber || '') : '';
  result.legalEvidenceSource = presence.ahu ? (presence.ahu.legalEvidenceSource || '') : '';
  result.legalConfidence = presence.ahu ? Number(presence.ahu.legalConfidence || 0) : 0;
  result.presenceScore = presence.score;
  result.presenceStatus = presence.status;
  result.domainMatch = Boolean(
    result.officialDomain && sameRegistrableDomain_(result.emailDomain, result.officialDomain)
  );

  assertBatchRunActive_(runId);
  const exactResults = openAIWebSearch_('\"' + email + '\"', runId);
  const evidence = findEmailEvidence_(exactResults, companyName, email, presence, runId);
  result.emailDataSource = 'OPENAI WEB SEARCH';
  result.exactEmailFound = evidence.exactFound;
  result.evidenceType = evidence.type;
  result.evidenceSource = evidence.sourceUrl;
  result.emailOnWebsite = evidence.channels.website.found;
  result.websiteEvidence = evidence.channels.website.sourceUrl;
  result.emailOnLinkedin = evidence.channels.linkedin.found;
  result.linkedinEvidence = evidence.channels.linkedin.sourceUrl;
  result.emailOnInstagram = evidence.channels.instagram.found;
  result.instagramEvidence = evidence.channels.instagram.sourceUrl;
  result.otherEmailEvidence = evidence.channels.other.sourceUrl;
  result.companyMatched = evidence.companyMatched;
  result.otherCompanySuspected = evidence.otherCompanySuspected;

  var score = 35; // format + MX
  if (result.domainMatch) score += 25;
  if (evidence.exactFound) score += 20;
  if (evidence.companyMatched) score += 20;
  if (evidence.type === 'OFFICIAL_WEBSITE') score += 15;
  if (/^OFFICIAL_(LINKEDIN|INSTAGRAM)$/.test(evidence.type) || evidence.type === 'OTHER_OFFICIAL_SOCIAL') score += 10;
  if (evidence.type === 'THIRD_PARTY_JOB_POST') score += 5;
  if (freeEmail && !evidence.companyMatched) score -= 15;
  if (evidence.otherCompanySuspected) score -= 40;
  result.score = Math.max(0, Math.min(100, score));

  if (evidence.otherCompanySuspected && !evidence.companyMatched) {
    result.status = 'MISMATCH_SUSPECTED';
    result.notes = 'Email ditemukan, tetapi mengarah ke perusahaan atau identitas lain.';
  } else if (evidence.exactFound && evidence.companyMatched &&
             (evidence.type === 'OFFICIAL_WEBSITE' ||
              /^OFFICIAL_(LINKEDIN|INSTAGRAM)$/.test(evidence.type) ||
              evidence.type === 'OTHER_OFFICIAL_SOCIAL')) {
    result.status = 'VALID_HIGH';
    result.notes = 'Email ditemukan pada kanal perusahaan yang cocok.';
  } else if (evidence.exactFound && evidence.companyMatched) {
    result.status = result.score >= 70 ? 'VALID_HIGH' : 'VALID_PROBABLE';
    result.notes = 'Email ditemukan pada sumber publik yang menyebut perusahaan.';
  } else if (!freeEmail && result.domainMatch) {
    result.status = 'VALID_PROBABLE';
    result.notes = 'Domain email cocok dengan website perusahaan dan MX aktif.';
  } else if (freeEmail) {
    result.status = 'NOT_PUBLICLY_VERIFIED';
    result.notes = 'Email gratis belum ditemukan pada kanal perusahaan.';
  } else {
    result.status = 'REVIEW_REQUIRED';
    result.notes = 'Hubungan email dengan perusahaan belum cukup kuat.';
  }
  return result;
}

function getOrFindCompanyPresence_(companySheet, companyIndex, companyName, location, forceRefresh, runId) {
  const companyKey = makeCompanyKey_(companyName);
  const cached = companyIndex.byKey[companyKey];

  if (cached && cleanText_(cached.manualLock).toUpperCase() === 'YES') {
    return { presence: companyItemToPresence_(cached), source: 'MANUAL COMPANY MASTER' };
  }
  if (!forceRefresh && isUsableCompanyCache_(cached)) {
    return { presence: companyItemToPresence_(cached), source: 'COMPANY MASTER' };
  }

  assertBatchRunActive_(runId);
  const searched = findCompanyPresence_(companyName, location, runId);
  assertBatchRunActive_(runId);

  var presence = searched;
  var note = '';
  const cachedFromLegacyProvider = cached && /BRAVE/.test(cleanText_(cached.dataSource).toUpperCase());
  const cachedMissingAhu = cached && !cleanText_(cached.ahuStatus);

  // Hanya refresh otomatis yang boleh mempertahankan hasil lama yang lebih kuat.
  // Manual refresh harus bisa memperbaiki false-positive lama walaupun skor baru lebih rendah.
  if (!forceRefresh && cached && !cachedFromLegacyProvider && !cachedMissingAhu &&
      companyPresenceRank_(cached.status) > companyPresenceRank_(searched.status)) {
    presence = companyItemToPresence_(cached);
    note = 'Hasil refresh otomatis lebih lemah; data lama dipertahankan.';
  } else if (forceRefresh && cached) {
    note = 'Manual refresh: data lama diganti dengan hasil pencarian terbaru.';
  } else if (cachedFromLegacyProvider) {
    note = 'Data Brave lama diganti dengan hasil OpenAI Web Search.';
  } else if (cachedMissingAhu) {
    note = 'Company Master lama dilengkapi dengan AHU engine dan social matcher terbaru.';
  }
  if (searched.ahu && searched.ahu.fallbackUsed) {
    note = appendNote_(note, 'AHU fallback alias, lokasi, dan badan hukum induk digunakan.');
  }

  assertBatchRunActive_(runId);
  upsertCompanyMaster_(companySheet, companyIndex, companyKey, companyName, location,
    presence, 'OPENAI WEB SEARCH + AHU', note);
  return { presence: presence, source: 'OPENAI WEB SEARCH + AHU' };
}

function refreshSelectedCompanies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== EMAIL_VALIDATOR_CONFIG.COMPANY_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('Buka sheet "Company Master" lalu pilih baris perusahaan yang ingin di-refresh.');
    return;
  }
  assertValidatorApiKey_();

  const range = sheet.getActiveRange();
  if (!range) return;
  const index = loadCompanyMasterIndex_(sheet);
  const headerMap = getHeaderMap_(sheet);
  var refreshed = 0;
  var skipped = 0;

  for (var row = Math.max(2, range.getRow()); row <= range.getLastRow(); row++) {
    const companyName = cleanText_(sheet.getRange(row, headerMap['Company Name']).getDisplayValue());
    const location = cleanText_(sheet.getRange(row, headerMap['Location']).getDisplayValue());
    const manualLock = cleanText_(sheet.getRange(row, headerMap['Manual Lock']).getDisplayValue()).toUpperCase();
    if (!companyName || manualLock === 'YES') {
      skipped++;
      continue;
    }
    getOrFindCompanyPresence_(sheet, index, companyName, location, true);
    refreshed++;
    Utilities.sleep(EMAIL_VALIDATOR_CONFIG.REQUEST_DELAY_MS);
  }
  updateSummarySheet_(ss);
  ss.toast(refreshed + ' perusahaan di-refresh, ' + skipped + ' dilewati.', 'Email Validator', 8);
}

function migrateLegacyValidationResults() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const legacy = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.LEGACY_SHEET_NAME);
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!legacy) {
    SpreadsheetApp.getUi().alert('Sheet "Email Validation Result" tidak ditemukan.');
    return;
  }
  if (!sourceSheet) throw new Error('Sheet "Job Board" tidak ditemukan.');

  ensureWorkspace_(ss);
  const legacyMap = getHeaderMap_(legacy);
  const sourceMap = getHeaderMap_(sourceSheet);
  const rawSheet = ensureRawSheet_(ss);
  const reviewSheet = ensureReviewSheet_(ss);
  const evidenceSheet = ensureEvidenceSheet_(ss);
  const companySheet = ensureCompanyMasterSheet_(ss);
  const rawIndex = loadRawIndex_(rawSheet);
  const reviewIndex = loadReviewIndex_(reviewSheet);
  const evidenceIndex = loadReviewIndex_(evidenceSheet);
  const companyIndex = loadCompanyMasterIndex_(companySheet);

  if (legacy.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Tidak ada data lama untuk dimigrasikan.');
    return;
  }

  const rows = legacy.getRange(2, 1, legacy.getLastRow() - 1, legacy.getLastColumn()).getValues();
  var migrated = 0;
  rows.forEach(function (legacyRow) {
    const sourceRow = Number(readMapped_(legacyRow, legacyMap, 'Source Row'));
    if (!sourceRow || sourceRow < 2 || sourceRow > sourceSheet.getLastRow()) return;

    const sourceValues = sourceSheet.getRange(sourceRow, 1, 1, sourceSheet.getLastColumn()).getDisplayValues()[0];
    const companyName = cleanText_(sourceValues[sourceMap['Company Name'] - 1]);
    const location = buildLocationText_(sourceValues, sourceMap);
    const result = legacyRowToResult_(legacyRow, legacyMap);
    result.validatorVersion = EMAIL_VALIDATOR_CONFIG.VERSION;
    result.companyDataSource = 'MIGRATED';
    result.emailDataSource = 'MIGRATED';

    const presence = resultToPresence_(result);
    const companyKey = makeCompanyKey_(companyName);
    upsertCompanyMaster_(companySheet, companyIndex, companyKey, companyName, location, presence, 'MIGRATED', 'Dibuat dari hasil validator v2.1.');
    upsertRawRow_(rawSheet, rawIndex, sourceRow, sourceValues, sourceMap, result);
    upsertReviewRow_(reviewSheet, reviewIndex, sourceRow, sourceValues, sourceMap, result);
    upsertEvidenceRow_(evidenceSheet, evidenceIndex, sourceRow, sourceValues, sourceMap, result);
    migrated++;
  });

  updateSummarySheet_(ss);
  ss.setActiveSheet(reviewSheet);
  SpreadsheetApp.getUi().alert(
    'Migrasi selesai',
    migrated + ' baris dipindahkan tanpa pencarian web baru.\nData perusahaan juga dimasukkan ke Company Master.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function rebuildReviewFromRaw() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.RAW_SHEET_NAME);
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!rawSheet || !sourceSheet) {
    SpreadsheetApp.getUi().alert('Sheet Raw atau Job Board belum tersedia.');
    return;
  }

  const rebuilt = rebuildViewsFromRaw_(ss);
  updateSummarySheet_(ss);
  ss.setActiveSheet(ensureReviewSheet_(ss));
  ss.toast(rebuilt + ' baris Review + Evidence berhasil dibangun ulang tanpa web search.', 'Email Validator', 7);
}

function rebuildViewsFromRaw_(ss) {
  const sourceSheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.JOB_SHEET_NAME);
  if (!ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.RAW_SHEET_NAME) || !sourceSheet) return 0;
  const rawSheet = ensureRawSheet_(ss);

  archiveLegacyReviewSheet_(ss);
  const reviewSheet = ensureReviewSheet_(ss);
  const evidenceSheet = ensureEvidenceSheet_(ss);

  clearSheetDataRows_(reviewSheet);
  clearSheetDataRows_(evidenceSheet);

  const reviewIndex = loadReviewIndex_(reviewSheet);
  const evidenceIndex = loadReviewIndex_(evidenceSheet);
  const rawMap = getHeaderMap_(rawSheet);
  const sourceMap = getHeaderMap_(sourceSheet);
  const rows = rawSheet.getLastRow() > 1
    ? rawSheet.getRange(2, 1, rawSheet.getLastRow() - 1, rawSheet.getLastColumn()).getValues()
    : [];

  var rebuilt = 0;
  rows.forEach(function (rawRow) {
    const sourceRow = Number(readMapped_(rawRow, rawMap, 'Source Row'));
    if (!sourceRow || sourceRow > sourceSheet.getLastRow()) return;
    const sourceValues = sourceSheet.getRange(sourceRow, 1, 1, sourceSheet.getLastColumn()).getDisplayValues()[0];
    const result = rawRowToResult_(rawRow, rawMap);
    upsertReviewRow_(reviewSheet, reviewIndex, sourceRow, sourceValues, sourceMap, result);
    upsertEvidenceRow_(evidenceSheet, evidenceIndex, sourceRow, sourceValues, sourceMap, result);
    rebuilt++;
  });
  return rebuilt;
}

function clearSheetDataRows_(sheet) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent().setBackground('#ffffff');
  }
}

function ensureWorkspace_(ss) {
  archiveLegacyReviewSheet_(ss);
  ensureReviewSheet_(ss);
  ensureEvidenceSheet_(ss);
  ensureCompanyMasterSheet_(ss);
  ensureRawSheet_(ss);
  ensureSummarySheet_(ss);
}

function archiveLegacyReviewSheet_(ss) {
  const legacy = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.LEGACY_REVIEW_SHEET_NAME);
  if (!legacy) return;

  const archiveName = EMAIL_VALIDATOR_CONFIG.LEGACY_REVIEW_ARCHIVE_SHEET_NAME;
  const existingArchive = ss.getSheetByName(archiveName);
  if (!existingArchive) {
    try { legacy.setName(archiveName); } catch (error) { console.warn(getErrorMessage_(error)); }
    const renamed = ss.getSheetByName(archiveName) || legacy;
    try { renamed.hideSheet(); } catch (error) { console.warn(getErrorMessage_(error)); }
    return;
  }

  // Jika archive sudah ada, sheet lama tetap dipertahankan tetapi disembunyikan.
  try { legacy.hideSheet(); } catch (error) { console.warn(getErrorMessage_(error)); }
}

function ensureReviewSheet_(ss) {
  var sheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.REVIEW_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_VALIDATOR_CONFIG.REVIEW_SHEET_NAME);
  ensureHeaders_(sheet, EMAIL_VALIDATOR_CONFIG.REVIEW_HEADERS);

  const map = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, lastCol)
    .setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  paintHeaderGroup_(sheet, map, ['Source Row', 'No', 'Team', 'Position', 'Company Name', 'Email'], '#1f4e78');
  paintHeaderGroup_(sheet, map, ['Final Status', 'Recommended Action'], '#7030a0');
  paintHeaderGroup_(sheet, map, ['Email Format', 'Domain MX', 'Domain Match', 'Exact Email Found'], '#c65911');
  paintHeaderGroup_(sheet, map, ['Company Presence Status', 'Validation Score'], '#548235');
  paintHeaderGroup_(sheet, map, ['Evidence Type', 'Validation Notes', 'Last Checked'], '#595959');

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(6);
  sheet.setTabColor('#2f75b5');
  if (map['Source Row']) sheet.hideColumns(map['Source Row']);

  const widthByHeader = {
    'Source Row': 70,
    'No': 55,
    'Team': 100,
    'Position': 200,
    'Company Name': 190,
    'Email': 220,
    'Final Status': 150,
    'Recommended Action': 160,
    'Email Format': 95,
    'Domain MX': 95,
    'Domain Match': 105,
    'Exact Email Found': 120,
    'Company Presence Status': 150,
    'Validation Score': 105,
    'Evidence Type': 145,
    'Validation Notes': 330,
    'Last Checked': 130
  };
  Object.keys(widthByHeader).forEach(function (header) {
    if (map[header]) sheet.setColumnWidth(map[header], widthByHeader[header]);
  });

  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  if (map['Validation Notes']) sheet.getRange(2, map['Validation Notes'], dataRows, 1).setWrap(true);
  if (map['Last Checked']) sheet.getRange(2, map['Last Checked'], dataRows, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  if (map['Validation Score']) sheet.getRange(2, map['Validation Score'], dataRows, 1).setNumberFormat('0');

  if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
    try { sheet.getRange(1, 1, sheet.getMaxRows(), lastCol).createFilter(); } catch (error) { console.warn(getErrorMessage_(error)); }
  }
  return sheet;
}

function ensureEvidenceSheet_(ss) {
  var sheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.EVIDENCE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_VALIDATOR_CONFIG.EVIDENCE_SHEET_NAME);
  ensureHeaders_(sheet, EMAIL_VALIDATOR_CONFIG.EVIDENCE_HEADERS);

  const map = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, lastCol)
    .setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  paintHeaderGroup_(sheet, map, ['Source Row', 'Company Name', 'Email', 'Final Status'], '#1f4e78');
  paintHeaderGroup_(sheet, map, ['Official Website', 'Website Match', 'Email on Website', 'Website Evidence'], '#548235');
  paintHeaderGroup_(sheet, map, ['LinkedIn Company', 'LinkedIn Match', 'Email on LinkedIn', 'LinkedIn Evidence'], '#2f75b5');
  paintHeaderGroup_(sheet, map, ['Instagram', 'Instagram Match', 'Email on Instagram', 'Instagram Evidence'], '#c2185b');
  paintHeaderGroup_(sheet, map, ['AHU Status', 'AHU Registered Name', 'AHU Evidence',
    'AHU Number', 'Legal Entity Name', 'Legal Relationship', 'Legal Evidence Source',
    'Legal Confidence', 'Entity Type'], '#00838f');
  paintHeaderGroup_(sheet, map, ['Other Email Evidence'], '#595959');

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);
  sheet.setTabColor('#8064a2');
  if (map['Source Row']) sheet.hideColumns(map['Source Row']);

  const widthByHeader = {
    'Source Row': 70,
    'Company Name': 190,
    'Email': 220,
    'Final Status': 150,
    'Official Website': 135,
    'Website Match': 110,
    'Email on Website': 115,
    'Website Evidence': 130,
    'LinkedIn Company': 135,
    'LinkedIn Match': 110,
    'Email on LinkedIn': 115,
    'LinkedIn Evidence': 130,
    'Instagram': 135,
    'Instagram Match': 110,
    'Email on Instagram': 115,
    'Instagram Evidence': 130,
    'AHU Status': 110,
    'AHU Registered Name': 220,
    'AHU Evidence': 130,
    'Other Email Evidence': 150,
    'AHU Number': 170,
    'Legal Entity Name': 220,
    'Legal Relationship': 180,
    'Legal Evidence Source': 135,
    'Legal Confidence': 110,
    'Entity Type': 120
  };
  Object.keys(widthByHeader).forEach(function (header) {
    if (map[header]) sheet.setColumnWidth(map[header], widthByHeader[header]);
  });

  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  ['AHU Registered Name', 'Legal Entity Name', 'Legal Relationship'].forEach(function (header) {
    if (map[header]) sheet.getRange(2, map[header], dataRows, 1).setWrap(true);
  });

  if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
    try { sheet.getRange(1, 1, sheet.getMaxRows(), lastCol).createFilter(); } catch (error) { console.warn(getErrorMessage_(error)); }
  }
  return sheet;
}

function paintHeaderGroup_(sheet, map, headers, background) {
  headers.forEach(function (header) {
    if (map[header]) sheet.getRange(1, map[header]).setBackground(background);
  });
}

function ensureCompanyMasterSheet_(ss) {
  var sheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.COMPANY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_VALIDATOR_CONFIG.COMPANY_SHEET_NAME);
  ensureHeaders_(sheet, EMAIL_VALIDATOR_CONFIG.COMPANY_HEADERS);
  invalidateCompanyMasterCacheOnce_(sheet);

  const map = getHeaderMap_(sheet);
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setBackground('#375623').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setTabColor('#70ad47');
  if (map['Company Key']) sheet.hideColumns(map['Company Key']);

  const widthByHeader = {
    'Company Key': 170,
    'Company Name': 190,
    'Company Alias': 250,
    'Location': 180,
    'Official Website': 240,
    'Official Domain': 150,
    'Official Domain Stem': 150,
    'LinkedIn': 260,
    'LinkedIn Match': 120,
    'Instagram': 220,
    'Instagram Match': 120,
    'AHU Status': 110,
    'AHU Registered Name': 230,
    'AHU Legal Form': 160,
    'AHU Parent Entity': 230,
    'AHU Evidence': 260,
    'Entity Type': 125,
    'Legal Entity Name': 230,
    'Legal Entity Type': 160,
    'Legal Relationship': 220,
    'AHU Number': 170,
    'Legal Evidence Source': 260,
    'Legal Confidence': 115,
    'Company Status': 135,
    'Data Source': 140,
    'Validator Version': 120,
    'Last Checked': 125,
    'Manual Lock': 95,
    'Notes': 280
  };
  Object.keys(widthByHeader).forEach(function (header) {
    if (map[header]) sheet.setColumnWidth(map[header], widthByHeader[header]);
  });

  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  if (map['Last Checked']) {
    sheet.getRange(2, map['Last Checked'], dataRows, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  }
  if (map['Manual Lock']) {
    sheet.getRange(2, map['Manual Lock'], dataRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['NO', 'YES'], true).setAllowInvalid(false).build()
    );
  }
  ['Company Alias', 'AHU Registered Name', 'AHU Parent Entity', 'AHU Evidence',
    'Legal Entity Name', 'Legal Relationship', 'Legal Evidence Source', 'Notes'].forEach(function (header) {
    if (map[header]) sheet.getRange(2, map[header], dataRows, 1).setWrap(true);
  });
  return sheet;
}

function invalidateCompanyMasterCacheOnce_(sheet) {
  const properties = PropertiesService.getDocumentProperties();
  const marker = EMAIL_VALIDATOR_CONFIG.COMPANY_CACHE_INVALIDATION_PROPERTY;
  if (properties.getProperty(marker) === EMAIL_VALIDATOR_CONFIG.VERSION) return;

  const map = getHeaderMap_(sheet);
  const versionCol = map['Validator Version'];
  const manualLockCol = map['Manual Lock'];
  const lastRow = sheet.getLastRow();

  // Tandai cache lama tanpa menghapus atau memindahkan data perusahaan. Baris
  // akan tetap terlihat, tetapi isUsableCompanyCache_ akan memaksa pencarian
  // ulang sampai upsert v3.3.5 menulis versi baru.
  if (versionCol && lastRow >= EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) {
    const values = sheet.getRange(
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW,
      1,
      lastRow - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1,
      sheet.getLastColumn()
    ).getValues();
    values.forEach(function (row, offset) {
      const manualLock = manualLockCol ? cleanText_(row[manualLockCol - 1]).toUpperCase() : '';
      const currentVersion = cleanText_(row[versionCol - 1]);
      if (manualLock !== 'YES' && currentVersion !== EMAIL_VALIDATOR_CONFIG.VERSION) {
        sheet.getRange(EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + offset, versionCol)
          .setValue('INVALIDATED_BEFORE_' + EMAIL_VALIDATOR_CONFIG.VERSION);
      }
    });
  }
  properties.setProperty(marker, EMAIL_VALIDATOR_CONFIG.VERSION);
}

/**
 * Hotfix v3.3.5: cache email diperiksa sebelum Company Master. Akibatnya hasil
 * discovery kosong dari engine lama dapat melewati invalidasi Company Master.
 * Tandai hanya baris discovery kosong sebagai stale, tanpa menghapus data.
 */
function invalidateEmptyDiscoveryCacheOnce_(companySheet, rawSheet) {
  const properties = PropertiesService.getDocumentProperties();
  const marker = EMAIL_VALIDATOR_CONFIG.SEARCH_ADAPTER_CACHE_INVALIDATION_PROPERTY;
  if (properties.getProperty(marker) === EMAIL_VALIDATOR_CONFIG.VERSION) return;

  function invalidateSheet(sheet, isCompanyMaster) {
    if (!sheet || sheet.getLastRow() < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) return;
    const map = getHeaderMap_(sheet);
    const versionCol = map['Validator Version'];
    if (!versionCol) return;

    const rowCount = sheet.getLastRow() - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1;
    const values = sheet.getRange(
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW, 1, rowCount, sheet.getLastColumn()
    ).getValues();
    const versions = values.map(function (row) {
      const currentVersion = cleanText_(row[versionCol - 1]);
      const manualLock = isCompanyMaster && map['Manual Lock']
        ? cleanText_(row[map['Manual Lock'] - 1]).toUpperCase()
        : '';
      if (manualLock === 'YES') return [currentVersion];

      const website = map['Official Website'] ? cleanText_(row[map['Official Website'] - 1]) : '';
      const linkedinHeader = map['LinkedIn Company'] ? 'LinkedIn Company' : 'LinkedIn';
      const linkedin = map[linkedinHeader] ? cleanText_(row[map[linkedinHeader] - 1]) : '';
      const instagram = map['Instagram'] ? cleanText_(row[map['Instagram'] - 1]) : '';
      const ahuStatus = map['AHU Status']
        ? cleanText_(row[map['AHU Status'] - 1]).toUpperCase()
        : '';
      const exactEmailFound = map['Exact Email Found']
        ? cleanText_(row[map['Exact Email Found'] - 1]).toUpperCase()
        : '';
      const hasLegalEvidence = [
        'DIRECT_MATCH', 'PARENT_ENTITY_MATCH', 'REVIEW', 'MANUAL_AHU_CHECK'
      ].indexOf(ahuStatus) !== -1;
      const discoveryEmpty = !website && !linkedin && !instagram &&
        !hasLegalEvidence && exactEmailFound !== 'FOUND';

      return [discoveryEmpty ? 'INVALIDATED_V335_SEARCH_FIX1' : currentVersion];
    });

    sheet.getRange(
      EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW, versionCol, rowCount, 1
    ).setValues(versions);
  }

  invalidateSheet(companySheet, true);
  invalidateSheet(rawSheet, false);
  properties.setProperty(marker, EMAIL_VALIDATOR_CONFIG.VERSION);
}

function ensureRawSheet_(ss) {
  var sheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.RAW_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_VALIDATOR_CONFIG.RAW_SHEET_NAME);
  ensureHeaders_(sheet, EMAIL_VALIDATOR_CONFIG.RAW_HEADERS);
  const map = getHeaderMap_(sheet);
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setBackground('#595959').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  if (map['Last Checked']) {
    sheet.getRange(2, map['Last Checked'], Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat('dd/MM/yyyy HH:mm');
  }
  sheet.setTabColor('#a5a5a5');
  try { sheet.hideSheet(); } catch (error) { console.warn(getErrorMessage_(error)); }
  return sheet;
}

function ensureSummarySheet_(ss) {
  var sheet = ss.getSheetByName(EMAIL_VALIDATOR_CONFIG.SUMMARY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(EMAIL_VALIDATOR_CONFIG.SUMMARY_SHEET_NAME, 0);
  sheet.setTabColor('#ffc000');
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const map = getHeaderMap_(sheet);
  var lastColumn = Math.max(sheet.getLastColumn(), 0);
  headers.forEach(function (header) {
    if (!map[header]) {
      lastColumn++;
      sheet.getRange(1, lastColumn).setValue(header);
      map[header] = lastColumn;
    }
  });
}

function updateSummarySheet_(ss) {
  const sheet = ensureSummarySheet_(ss);
  const review = ensureReviewSheet_(ss);
  const company = ensureCompanyMasterSheet_(ss);
  const reviewMap = getHeaderMap_(review);
  const rows = review.getLastRow() > 1
    ? review.getRange(2, 1, review.getLastRow() - 1, review.getLastColumn()).getDisplayValues()
    : [];

  const counts = { 'TERVERIFIKASI': 0, 'KEMUNGKINAN VALID': 0, 'CEK MANUAL': 0, 'JANGAN DIGUNAKAN': 0 };
  const companies = {};
  const emails = {};
  rows.forEach(function (row) {
    const status = cleanText_(row[reviewMap['Final Status'] - 1]).toUpperCase();
    if (counts.hasOwnProperty(status)) counts[status]++;
    const companyName = normalizeCompanyKey_(row[reviewMap['Company Name'] - 1]);
    const email = normalizeEmail_(row[reviewMap['Email'] - 1]);
    if (companyName) companies[companyName] = true;
    if (email) emails[email] = true;
  });

  try { sheet.getDataRange().breakApart(); } catch (error) { console.warn(getErrorMessage_(error)); }
  sheet.clear();
  sheet.getRange('A1:F1').merge().setValue('RINGKASAN VALIDASI EMAIL')
    .setBackground('#1f4e78').setFontColor('#ffffff').setFontWeight('bold')
    .setFontSize(16).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.getRange('A2:F2').merge().setValue('Terakhir diperbarui: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#666666').setHorizontalAlignment('center');

  const labels = [['Baris Dicek', 'Email Unik', 'Perusahaan', 'Terverifikasi', 'Kemungkinan Valid', 'Perlu Tindakan']];
  const values = [[rows.length, Object.keys(emails).length, Object.keys(companies).length,
    counts['TERVERIFIKASI'], counts['KEMUNGKINAN VALID'], counts['CEK MANUAL'] + counts['JANGAN DIGUNAKAN']]];
  sheet.getRange('A4:F4').setValues(labels).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#d9eaf7');
  sheet.getRange('A5:F5').setValues(values).setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');

  sheet.getRange('A8:D8').setValues([['Status', 'Arti', 'Tindakan', 'Warna']])
    .setBackground('#1f4e78').setFontColor('#ffffff').setFontWeight('bold');
  const guide = [
    ['TERVERIFIKASI', 'Email memiliki bukti publik yang cocok', 'Bisa digunakan', 'Hijau'],
    ['KEMUNGKINAN VALID', 'Domain cocok atau bukti cukup kuat', 'Bisa dicoba dengan hati-hati', 'Hijau muda'],
    ['CEK MANUAL', 'Hubungan email belum cukup kuat', 'Buka sumber bukti dan cek ulang', 'Kuning'],
    ['JANGAN DIGUNAKAN', 'Format/domain salah, mismatch, atau error', 'Hindari sampai diperbaiki', 'Merah']
  ];
  sheet.getRange(9, 1, guide.length, 4).setValues(guide).setWrap(true);
  sheet.getRange('A9:A9').setBackground('#b7e1cd');
  sheet.getRange('A10:A10').setBackground('#d9ead3');
  sheet.getRange('A11:A11').setBackground('#fff2cc');
  sheet.getRange('A12:A12').setBackground('#f4cccc');

  sheet.getRange('A15:D15').setValues([['Database', 'Jumlah', 'Masa Cache', 'Keterangan']])
    .setBackground('#375623').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('A16:D17').setValues([
    ['Company Master', Math.max(company.getLastRow() - 1, 0), EMAIL_VALIDATOR_CONFIG.COMPANY_CACHE_MAX_AGE_DAYS + ' hari', 'Perusahaan sama tidak dicari ulang'],
    ['Email Cache', Object.keys(emails).length, EMAIL_VALIDATOR_CONFIG.EMAIL_CACHE_MAX_AGE_DAYS + ' hari', 'Perusahaan + email sama tidak divalidasi ulang']
  ]).setWrap(true);

  sheet.getRange('A20:D20').setValues([['Tampilan', 'Dipakai untuk', 'Frekuensi', 'Catatan']])
    .setBackground('#7030a0').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('A21:D24').setValues([
    ['Email Review', 'Keputusan cepat: email aman dipakai atau tidak', 'Utama', '16 kolom visible'],
    ['Email Evidence', 'Investigasi Website / LinkedIn / Instagram / AHU', 'Saat perlu cek', 'URL tampil sebagai label hyperlink'],
    ['Company Master', 'Identitas perusahaan dan cache presence', 'Sesekali', 'Bisa Manual Lock'],
    ['Email Validation Raw', 'Audit trail teknis lengkap', 'Jarang', 'Hidden secara default']
  ]).setWrap(true);

  [120, 170, 160, 220, 145, 145].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.setFrozenRows(2);
}

function loadReviewIndex_(sheet) {
  const index = { bySourceRow: {} };
  if (sheet.getLastRow() < 2) return index;
  const map = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  rows.forEach(function (row, offset) {
    const sourceRow = cleanText_(row[map['Source Row'] - 1]);
    if (sourceRow) index.bySourceRow[sourceRow] = offset + 2;
  });
  return index;
}

function upsertReviewRow_(sheet, index, sourceRow, sourceValues, sourceMap, result) {
  const map = getHeaderMap_(sheet);
  const rowKey = String(sourceRow);
  const outputRow = index.bySourceRow[rowKey] || sheet.getLastRow() + 1;
  const finalStatus = mapFinalStatus_(result.status);
  const evidenceUrl = bestEvidenceSource_(result);
  const evidenceLabel = evidenceDisplayLabel_(result.evidenceType) ||
    (result.officialWebsite ? '🌐 Website' :
      (result.linkedinUrl ? 'in LinkedIn' :
        (result.instagramUrl ? '📷 Instagram' : (evidenceUrl ? '🔎 Evidence' : ''))));
  const values = {
    'Source Row': sourceRow,
    'No': sourceMap['No'] ? sourceValues[sourceMap['No'] - 1] : '',
    'Team': sourceMap['Team'] ? sourceValues[sourceMap['Team'] - 1] : '',
    'Position': sourceMap['Position'] ? sourceValues[sourceMap['Position'] - 1] : '',
    'Company Name': sourceMap['Company Name'] ? sourceValues[sourceMap['Company Name'] - 1] : '',
    'Email': result.email || '',
    'Final Status': finalStatus,
    'Recommended Action': recommendedAction_(finalStatus),
    'Email Format': result.formatValid === true ? 'VALID' : (result.formatValid === false ? 'INVALID' : ''),
    'Domain MX': result.hasMx === true ? 'ACTIVE' : (result.hasMx === false ? 'NO_MX' : ''),
    'Domain Match': result.domainMatch === true ? 'MATCH' : (result.domainMatch === false ? 'NO_MATCH' : ''),
    'Exact Email Found': result.exactEmailFound === true ? 'FOUND' : (result.exactEmailFound === false ? 'NOT_FOUND' : ''),
    'Company Presence Status': friendlyCompanyStatus_(result.presenceStatus),
    'Validation Score': Number(result.score || 0),
    'Evidence Type': evidenceLabel,
    'Validation Notes': result.notes || '',
    'Last Checked': result.lastChecked || new Date()
  };

  Object.keys(values).forEach(function (header) {
    if (map[header]) sheet.getRange(outputRow, map[header]).setValue(values[header]);
  });

  if (map['Evidence Type'] && evidenceUrl) {
    setLabeledHyperlink_(sheet.getRange(outputRow, map['Evidence Type']), evidenceLabel || '🔎 Evidence', evidenceUrl);
  }

  applyReviewStatusColor_(sheet, outputRow, map, finalStatus);
  applyEvidenceCellColors_(sheet, outputRow, map, values);
  applyCompanyPresenceColor_(sheet, outputRow, map, values['Company Presence Status']);
  if (map['Validation Score']) sheet.getRange(outputRow, map['Validation Score']).setHorizontalAlignment('center');
  index.bySourceRow[rowKey] = outputRow;
}

function upsertEvidenceRow_(sheet, index, sourceRow, sourceValues, sourceMap, result) {
  const map = getHeaderMap_(sheet);
  const rowKey = String(sourceRow);
  const outputRow = index.bySourceRow[rowKey] || sheet.getLastRow() + 1;
  const finalStatus = mapFinalStatus_(result.status);
  const values = {
    'Source Row': sourceRow,
    'Company Name': sourceMap['Company Name'] ? sourceValues[sourceMap['Company Name'] - 1] : '',
    'Email': result.email || '',
    'Final Status': finalStatus,
    'Official Website': result.officialWebsite ? '🌐 Website' : '',
    'Website Match': result.websiteMatch || '',
    'Email on Website': evidenceFlag_(result.emailOnWebsite),
    'Website Evidence': result.websiteEvidence ? '🔎 Evidence' : '',
    'LinkedIn Company': result.linkedinUrl ? 'in LinkedIn' : '',
    'LinkedIn Match': result.linkedinMatch || '',
    'Email on LinkedIn': evidenceFlag_(result.emailOnLinkedin),
    'LinkedIn Evidence': result.linkedinEvidence ? '🔎 Evidence' : '',
    'Instagram': result.instagramUrl ? '📷 Instagram' : '',
    'Instagram Match': result.instagramMatch || '',
    'Email on Instagram': evidenceFlag_(result.emailOnInstagram),
    'Instagram Evidence': result.instagramEvidence ? '🔎 Evidence' : '',
    'AHU Status': result.ahuStatus || '',
    'AHU Registered Name': result.ahuRegisteredName || '',
    'AHU Evidence': result.ahuEvidence ? '🏛️ AHU Evidence' : '',
    'Other Email Evidence': result.otherEmailEvidence ? '🔎 Other Evidence' : '',
    'AHU Number': result.ahuNumber || '',
    'Legal Entity Name': result.legalEntityName || '',
    'Legal Relationship': result.legalRelationship || '',
    'Legal Evidence Source': result.legalEvidenceSource ? '🔎 Legal Evidence' : '',
    'Legal Confidence': Number(result.legalConfidence || 0),
    'Entity Type': result.entityType || ''
  };

  Object.keys(values).forEach(function (header) {
    if (map[header]) sheet.getRange(outputRow, map[header]).setValue(values[header]);
  });

  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Official Website', '🌐 Website', result.officialWebsite);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Website Evidence', '🔎 Evidence', result.websiteEvidence);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'LinkedIn Company', 'in LinkedIn', result.linkedinUrl);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'LinkedIn Evidence', '🔎 Evidence', result.linkedinEvidence);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Instagram', '📷 Instagram', result.instagramUrl);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Instagram Evidence', '🔎 Evidence', result.instagramEvidence);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'AHU Evidence', '🏛️ AHU Evidence', result.ahuEvidence);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Legal Evidence Source', '🔎 Legal Evidence', result.legalEvidenceSource);
  setEvidenceLinkIfPresent_(sheet, outputRow, map, 'Other Email Evidence', '🔎 Other Evidence', result.otherEmailEvidence);

  applyReviewStatusColor_(sheet, outputRow, map, finalStatus);
  applyEvidenceCellColors_(sheet, outputRow, map, values);
  index.bySourceRow[rowKey] = outputRow;
}

function setEvidenceLinkIfPresent_(sheet, row, map, header, label, url) {
  if (!map[header] || !url) return;
  setLabeledHyperlink_(sheet.getRange(row, map[header]), label, url);
}

function setLabeledHyperlink_(cell, label, url) {
  const cleanUrl = cleanText_(url);
  if (!cleanUrl) {
    cell.setValue(label || '');
    return;
  }
  try {
    const rich = SpreadsheetApp.newRichTextValue()
      .setText(label || '🔎 Evidence')
      .setLinkUrl(cleanUrl)
      .build();
    cell.setRichTextValue(rich).setHorizontalAlignment('center');
  } catch (error) {
    cell.setValue(label || cleanUrl);
  }
}

function evidenceDisplayLabel_(evidenceType) {
  const type = cleanText_(evidenceType).toUpperCase();
  if (type === 'OFFICIAL_WEBSITE') return '🌐 Website';
  if (type === 'OFFICIAL_LINKEDIN' || type === 'LINKEDIN_SOURCE') return 'in LinkedIn';
  if (type === 'OFFICIAL_INSTAGRAM' || type === 'INSTAGRAM_SOURCE') return '📷 Instagram';
  if (type === 'OTHER_OFFICIAL_SOCIAL') return '👥 Social';
  if (type === 'THIRD_PARTY_JOB_POST') return '💼 Job Post';
  if (type) return '🔎 Evidence';
  return '';
}

function applyCompanyPresenceColor_(sheet, row, map, status) {
  const col = map['Company Presence Status'];
  if (!col) return;
  const value = cleanText_(status).toUpperCase();
  var color = '#eeeeee';
  if (value === 'KUAT') color = '#b7e1cd';
  else if (value === 'ADA') color = '#d9ead3';
  else if (value === 'PERLU CEK') color = '#fff2cc';
  sheet.getRange(row, col).setBackground(color).setFontWeight('bold').setHorizontalAlignment('center');
}

function evidenceFlag_(value) {
  if (value === true) return 'FOUND';
  if (value === false) return 'NOT_FOUND';
  return '';
}

function parseEvidenceFlag_(value) {
  const normalized = cleanText_(value).toUpperCase();
  if (normalized === 'FOUND') return true;
  if (normalized === 'NOT_FOUND') return false;
  return null;
}

function booleanFlag_(value) {
  if (value === true) return 'YES';
  if (value === false) return 'NO';
  return '';
}

function parseBooleanFlag_(value) {
  const normalized = cleanText_(value).toUpperCase();
  if (normalized === 'YES' || normalized === 'TRUE' || normalized === 'MATCH') return true;
  if (normalized === 'NO' || normalized === 'FALSE' || normalized === 'NO_MATCH') return false;
  return null;
}

function applyEvidenceCellColors_(sheet, row, map, values) {
  ['Email Format', 'Domain MX', 'Domain Match', 'Exact Email Found',
   'Website Match', 'Email on Website', 'LinkedIn Match', 'Email on LinkedIn',
   'Instagram Match', 'Email on Instagram'].forEach(function (header) {
    if (!map[header]) return;
    const value = cleanText_(values[header]).toUpperCase();
    var color = '#ffffff';
    if (/VALID|ACTIVE|MATCH|FOUND|OFFICIAL_LINK/.test(value) && !/INVALID|NO_MATCH|NOT_FOUND/.test(value)) color = '#d9ead3';
    else if (/INVALID|NO_MX|NO_MATCH/.test(value)) color = '#f4cccc';
    else if (/NOT_FOUND|REVIEW/.test(value)) color = '#fff2cc';
    sheet.getRange(row, map[header]).setBackground(color).setHorizontalAlignment('center');
  });
}

function applyReviewStatusColor_(sheet, row, map, status) {
  const col = map['Final Status'];
  if (!col) return;
  const cell = sheet.getRange(row, col);
  const normalized = cleanText_(status).toUpperCase();
  var background = '#ffffff';
  var fontColor = '#000000';
  if (normalized === 'TERVERIFIKASI') background = '#b7e1cd';
  else if (normalized === 'KEMUNGKINAN VALID') background = '#d9ead3';
  else if (normalized === 'CEK MANUAL') background = '#fff2cc';
  else if (normalized === 'JANGAN DIGUNAKAN') {
    background = '#f4cccc';
    fontColor = '#9c0006';
  }
  cell.setBackground(background).setFontColor(fontColor).setFontWeight('bold').setHorizontalAlignment('center');
}

function mapFinalStatus_(technicalStatus) {
  const status = cleanText_(technicalStatus).toUpperCase();
  if (status === 'VALID_HIGH') return 'TERVERIFIKASI';
  if (status === 'VALID_PROBABLE') return 'KEMUNGKINAN VALID';
  if (/MISMATCH|INVALID|ERROR/.test(status)) return 'JANGAN DIGUNAKAN';
  return 'CEK MANUAL';
}

function recommendedAction_(finalStatus) {
  if (finalStatus === 'TERVERIFIKASI') return 'BISA DIGUNAKAN';
  if (finalStatus === 'KEMUNGKINAN VALID') return 'BISA DICOBA';
  if (finalStatus === 'JANGAN DIGUNAKAN') return 'HINDARI';
  return 'CEK LINK / KONFIRMASI';
}

function companyProofLabel_(result) {
  const channels = [];
  if (result.websiteMatch === 'MATCH') channels.push('Website');
  if (/MATCH|OFFICIAL_LINK/.test(result.linkedinMatch || '')) channels.push('LinkedIn');
  if (/MATCH|OFFICIAL_LINK/.test(result.instagramMatch || '')) channels.push('Instagram');

  var strength = 'TIDAK DITEMUKAN';
  if (result.presenceStatus === 'VERIFIED_STRONG') strength = 'KUAT';
  else if (result.presenceStatus === 'FOUND') strength = 'ADA';
  else if (result.presenceStatus === 'REVIEW_REQUIRED') strength = 'PERLU CEK';
  return channels.length ? strength + ' — ' + channels.join(' + ') : strength;
}

function bestEvidenceSource_(result) {
  return result.evidenceSource || result.officialWebsite || result.linkedinUrl || result.instagramUrl || '';
}

function shortReason_(result, finalStatus) {
  if (finalStatus === 'TERVERIFIKASI') return 'Email ditemukan pada sumber publik yang cocok dengan perusahaan.';
  if (finalStatus === 'KEMUNGKINAN VALID') {
    if (result.domainMatch) return 'Domain email cocok dengan website perusahaan dan MX aktif.';
    return 'Bukti publik cukup kuat, tetapi alamat email belum sepenuhnya terkonfirmasi.';
  }
  if (finalStatus === 'JANGAN DIGUNAKAN') {
    if (result.status === 'INVALID_FORMAT') return 'Format email tidak valid.';
    if (result.status === 'INVALID_DOMAIN') return 'Domain email tidak memiliki MX.';
    if (result.status === 'MISMATCH_SUSPECTED') return 'Email diduga terkait perusahaan atau identitas lain.';
    return 'Terjadi error validasi; jangan digunakan sebelum diperiksa.';
  }
  if (isFreeEmailDomain_(result.emailDomain)) return 'Email gratis belum ditemukan pada kanal resmi perusahaan.';
  if (result.presenceStatus === 'NOT_FOUND') return 'Identitas perusahaan belum cukup ditemukan di web.';
  return 'Hubungan email dengan perusahaan belum cukup kuat; cek sumber bukti.';
}

function incrementFriendlySummary_(summary, status) {
  if (status === 'TERVERIFIKASI') summary.verified++;
  else if (status === 'KEMUNGKINAN VALID') summary.probable++;
  else if (status === 'JANGAN DIGUNAKAN') summary.blocked++;
  else summary.manual++;
}

function loadCompanyMasterIndex_(sheet) {
  const index = { byKey: {}, byRow: {} };
  if (sheet.getLastRow() < 2) return index;
  const map = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (row, offset) {
    const key = cleanText_(row[map['Company Key'] - 1]);
    if (!key) return;
    const item = {
      outputRow: offset + 2,
      key: key,
      companyName: readMapped_(row, map, 'Company Name') || '',
      companyAlias: readMapped_(row, map, 'Company Alias') || '',
      location: readMapped_(row, map, 'Location') || '',
      website: readMapped_(row, map, 'Official Website') || '',
      domain: readMapped_(row, map, 'Official Domain') || '',
      domainStem: readMapped_(row, map, 'Official Domain Stem') || '',
      linkedin: readMapped_(row, map, 'LinkedIn') || '',
      linkedinMatch: readMapped_(row, map, 'LinkedIn Match') || '',
      instagram: readMapped_(row, map, 'Instagram') || '',
      instagramMatch: readMapped_(row, map, 'Instagram Match') || '',
      ahuStatus: readMapped_(row, map, 'AHU Status') || '',
      ahuRegisteredName: readMapped_(row, map, 'AHU Registered Name') || '',
      ahuLegalForm: readMapped_(row, map, 'AHU Legal Form') || '',
      ahuParentEntity: readMapped_(row, map, 'AHU Parent Entity') || '',
      ahuEvidence: readMapped_(row, map, 'AHU Evidence') || '',
      entityType: readMapped_(row, map, 'Entity Type') || '',
      legalEntityName: readMapped_(row, map, 'Legal Entity Name') || '',
      legalEntityType: readMapped_(row, map, 'Legal Entity Type') || '',
      legalRelationship: readMapped_(row, map, 'Legal Relationship') || '',
      ahuNumber: readMapped_(row, map, 'AHU Number') || '',
      legalEvidenceSource: readMapped_(row, map, 'Legal Evidence Source') || '',
      legalConfidence: readMapped_(row, map, 'Legal Confidence') || '',
      status: readMapped_(row, map, 'Company Status') || '',
      dataSource: readMapped_(row, map, 'Data Source') || '',
      validatorVersion: readMapped_(row, map, 'Validator Version') || '',
      lastChecked: readMapped_(row, map, 'Last Checked') || '',
      manualLock: readMapped_(row, map, 'Manual Lock') || 'NO',
      notes: readMapped_(row, map, 'Notes') || ''
    };
    index.byKey[key] = item;
    index.byRow[String(offset + 2)] = item;
  });
  return index;
}

function upsertCompanyMaster_(sheet, index, key, companyName, location, presence, dataSource, notes) {
  if (!key) return;
  const map = getHeaderMap_(sheet);
  const existing = index.byKey[key];
  if (existing && cleanText_(existing.manualLock).toUpperCase() === 'YES') return;

  // Keputusan mempertahankan hasil lama dilakukan di getOrFindCompanyPresence_.
  // Jangan blok overwrite di sini karena manual refresh harus bisa memperbaiki false-positive lama.
  const outputRow = existing ? existing.outputRow : sheet.getLastRow() + 1;
  const strongWebsite = presence.website && presence.website.status === 'MATCH';
  const strongLinkedIn = presence.linkedin && /MATCH|OFFICIAL_LINK/.test(presence.linkedin.status || '');
  const strongInstagram = presence.instagram && /MATCH|OFFICIAL_LINK/.test(presence.instagram.status || '');
  const ahu = presence.ahu || {
    status: 'NOT_FOUND', registeredName: '', legalEntityName: '', legalEntityType: '',
    legalRelationship: '', ahuNumber: '', evidenceUrl: '', legalEvidenceSource: '', legalConfidence: 0
  };
  const ahuEvidence = isOfficialAhuEvidenceUrl_(ahu.evidenceUrl) ? ahu.evidenceUrl : '';
  const legalEvidenceSource = isLegalEvidenceSourceUrl_(ahu.legalEvidenceSource || ahu.source, companyName, presence.website && presence.website.domain)
    ? (ahu.legalEvidenceSource || ahu.source) : '';
  const ahuStatus = ['DIRECT_MATCH', 'PARENT_ENTITY_MATCH', 'REVIEW', 'MANUAL_AHU_CHECK'].indexOf(
    cleanText_(ahu.status).toUpperCase()
  ) !== -1 && (ahuEvidence || legalEvidenceSource)
    ? cleanText_(ahu.status).toUpperCase() : (ahu.status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'NOT_FOUND');
  const identity = buildCompanyIdentity_(companyName);
  const companyAlias = cleanText_(presence.companyAlias || identity.aliases.join(' | '));

  const values = {
    'Company Key': key,
    'Company Name': companyName,
    'Company Alias': companyAlias,
    'Location': location,
    'Official Website': strongWebsite ? (presence.website.url || '') : '',
    'Official Domain': strongWebsite ? (presence.website.domain || '') : '',
    'Official Domain Stem': strongWebsite
      ? (presence.website.domainStem || getDomainStem_(presence.website.domain || '')) : '',
    'LinkedIn': strongLinkedIn ? (presence.linkedin.url || '') : '',
    'LinkedIn Match': presence.linkedin ? (presence.linkedin.status || '') : '',
    'Instagram': strongInstagram ? (presence.instagram.url || '') : '',
    'Instagram Match': presence.instagram ? (presence.instagram.status || '') : '',
    'AHU Status': ahuStatus,
    'AHU Registered Name': ahu.registeredName || '',
    'AHU Legal Form': ahu.legalForm || '',
    'AHU Parent Entity': ahu.parentEntity || '',
    'AHU Evidence': ahuEvidence,
    'Entity Type': presence.entityType || resolveEntityType_(companyName, presence.website && presence.website.url, location),
    'Legal Entity Name': ahu.legalEntityName || ahu.registeredName || '',
    'Legal Entity Type': ahu.legalEntityType || ahu.legalForm || '',
    'Legal Relationship': ahu.legalRelationship || '',
    'AHU Number': ahu.ahuNumber || '',
    'Legal Evidence Source': legalEvidenceSource,
    'Legal Confidence': Number(ahu.legalConfidence || 0),
    'Company Status': friendlyCompanyStatus_(presence.status),
    'Data Source': dataSource || 'OPENAI WEB SEARCH',
    'Validator Version': EMAIL_VALIDATOR_CONFIG.VERSION,
    'Last Checked': new Date(),
    'Manual Lock': existing ? (existing.manualLock || 'NO') : 'NO',
    'Notes': notes || ''
  };

  Object.keys(values).forEach(function (header) {
    if (map[header]) sheet.getRange(outputRow, map[header]).setValue(values[header]);
  });
  applyCompanyStatusColor_(sheet, outputRow, map, values['Company Status']);

  const item = {
    outputRow: outputRow,
    key: key,
    companyName: companyName,
    companyAlias: values['Company Alias'],
    location: location,
    website: values['Official Website'],
    domain: values['Official Domain'],
    domainStem: values['Official Domain Stem'],
    linkedin: values['LinkedIn'],
    linkedinMatch: values['LinkedIn Match'],
    instagram: values['Instagram'],
    instagramMatch: values['Instagram Match'],
    ahuStatus: values['AHU Status'],
    ahuRegisteredName: values['AHU Registered Name'],
    ahuLegalForm: values['AHU Legal Form'],
    ahuParentEntity: values['AHU Parent Entity'],
    ahuEvidence: values['AHU Evidence'],
    entityType: values['Entity Type'],
    legalEntityName: values['Legal Entity Name'],
    legalEntityType: values['Legal Entity Type'],
    legalRelationship: values['Legal Relationship'],
    ahuNumber: values['AHU Number'],
    legalEvidenceSource: values['Legal Evidence Source'],
    legalConfidence: values['Legal Confidence'],
    status: values['Company Status'],
    dataSource: values['Data Source'],
    validatorVersion: values['Validator Version'],
    lastChecked: values['Last Checked'],
    manualLock: values['Manual Lock'],
    notes: values['Notes']
  };
  index.byKey[key] = item;
  index.byRow[String(outputRow)] = item;
}

function friendlyCompanyStatus_(technical) {
  const status = cleanText_(technical).toUpperCase();
  if (status === 'VERIFIED_STRONG' || status === 'KUAT') return 'KUAT';
  if (status === 'FOUND' || status === 'ADA') return 'ADA';
  if (status === 'REVIEW_REQUIRED' || status === 'PERLU CEK') return 'PERLU CEK';
  return 'TIDAK DITEMUKAN';
}

function applyCompanyStatusColor_(sheet, row, map, status) {
  const col = map['Company Status'];
  if (!col) return;
  const cell = sheet.getRange(row, col);
  const normalized = cleanText_(status).toUpperCase();
  var background = '#ffffff';
  if (normalized === 'KUAT') background = '#b7e1cd';
  else if (normalized === 'ADA') background = '#d9ead3';
  else if (normalized === 'PERLU CEK') background = '#fff2cc';
  else background = '#eeeeee';
  cell.setBackground(background).setFontWeight('bold').setHorizontalAlignment('center');
}

function isUsableCompanyCache_(item) {
  if (!item) return false;
  if (cleanText_(item.manualLock).toUpperCase() === 'YES') return true;

  if (!isCompatibleCompanyMasterCacheVersion_(item.validatorVersion)) return false;

  // Cache provider lama dan Company Master sebelum resolver legal baru dianggap stale satu kali.
  if (/BRAVE/.test(cleanText_(item.dataSource).toUpperCase())) return false;
  if (!cleanText_(item.ahuStatus)) return false;
  const ahuStatus = cleanText_(item.ahuStatus).toUpperCase();
  if (['DIRECT_MATCH', 'PARENT_ENTITY_MATCH', 'REVIEW', 'MANUAL_AHU_CHECK', 'NOT_FOUND', 'NOT_APPLICABLE'].indexOf(ahuStatus) === -1) return false;
  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH|REVIEW|MANUAL_AHU_CHECK)$/.test(ahuStatus) &&
      !isLegalEvidenceSourceUrl_(item.legalEvidenceSource, item.companyName, item.domain) &&
      !isOfficialAhuEvidenceUrl_(item.ahuEvidence)) return false;

  if (!item.lastChecked || !item.status) return false;
  const checked = new Date(item.lastChecked);
  if (isNaN(checked.getTime())) return false;
  return Date.now() - checked.getTime() <=
    EMAIL_VALIDATOR_CONFIG.COMPANY_CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function companyItemToPresence_(item) {
  const status = technicalCompanyStatus_(item.status);
  const websiteStatus = item.website && item.domain ? 'MATCH' : 'NOT_FOUND';
  const ahuEvidence = isOfficialAhuEvidenceUrl_(item.ahuEvidence) ? item.ahuEvidence : '';
  const legalEvidenceSource = isLegalEvidenceSourceUrl_(item.legalEvidenceSource, item.companyName, item.domain)
    ? item.legalEvidenceSource : '';
  const ahuStatus = ahuEvidence
    ? (cleanText_(item.ahuStatus).toUpperCase() || 'NOT_FOUND')
    : (cleanText_(item.ahuStatus).toUpperCase() === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' :
      (legalEvidenceSource
        ? cleanText_(item.ahuStatus).toUpperCase() : 'NOT_FOUND'));
  return {
    website: {
      url: item.website || '', website: item.website || '', domain: item.domain || '',
      domainStem: item.domainStem || getDomainStem_(item.domain || ''),
      status: websiteStatus, score: websiteStatus === 'MATCH' ? 60 : 0, source: item.website || ''
    },
    linkedin: {
      url: item.linkedin || '', status: item.linkedinMatch || (item.linkedin ? 'MATCH' : 'NOT_FOUND'),
      score: item.linkedin ? 50 : 0, source: item.linkedin || ''
    },
    instagram: {
      url: item.instagram || '', status: item.instagramMatch || (item.instagram ? 'MATCH' : 'NOT_FOUND'),
      score: item.instagram ? 50 : 0, source: item.instagram || ''
    },
    ahu: {
      status: ahuStatus,
      registeredName: item.ahuRegisteredName || '',
      legalEntityName: item.legalEntityName || item.ahuRegisteredName || '',
      legalEntityType: item.legalEntityType || item.ahuLegalForm || '',
      legalForm: item.ahuLegalForm || '',
      parentEntity: item.ahuParentEntity || '',
      legalRelationship: item.legalRelationship || '',
      ahuNumber: item.ahuNumber || '',
      evidenceUrl: ahuEvidence,
      legalEvidenceSource: legalEvidenceSource,
      legalConfidence: Number(item.legalConfidence || 0),
      score: /^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahuStatus) ? 25 :
        (/^(REVIEW|MANUAL_AHU_CHECK)$/.test(ahuStatus) ? 6 : 0)
    },
    entityType: item.entityType || resolveEntityType_(item.companyName, item.website, item.location),
    companyAlias: item.companyAlias || '',
    score: status === 'VERIFIED_STRONG' ? 80 : (status === 'FOUND' ? 50 : (status === 'REVIEW_REQUIRED' ? 20 : 0)),
    status: status
  };
}

function technicalCompanyStatus_(friendly) {
  const value = cleanText_(friendly).toUpperCase();
  if (value === 'KUAT' || value === 'VERIFIED_STRONG') return 'VERIFIED_STRONG';
  if (value === 'ADA' || value === 'FOUND') return 'FOUND';
  if (value === 'PERLU CEK' || value === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  return 'NOT_FOUND';
}

function companyPresenceRank_(status) {
  const normalized = technicalCompanyStatus_(status);
  if (normalized === 'VERIFIED_STRONG') return 3;
  if (normalized === 'FOUND') return 2;
  if (normalized === 'REVIEW_REQUIRED') return 1;
  return 0;
}

function loadRawIndex_(sheet) {
  const index = { rowsBySourceRow: {}, bySourceRow: {}, byValidationKey: {} };
  if (sheet.getLastRow() < 2) return index;
  const map = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (row, offset) {
    const item = rawRowToResult_(row, map);
    item.outputRow = offset + 2;
    item.sourceRow = cleanText_(readMapped_(row, map, 'Source Row'));
    item.companyName = cleanText_(readMapped_(row, map, 'Company Name'));
    if (item.sourceRow) {
      index.rowsBySourceRow[item.sourceRow] = item;
      index.bySourceRow[item.sourceRow] = item.outputRow;
    }
    const key = makeValidationKey_(item.companyName, item.email);
    if (key && (!index.byValidationKey[key] || isUsableEmailCache_(item))) index.byValidationKey[key] = item;
  });
  return index;
}

function upsertRawRow_(sheet, index, sourceRow, sourceValues, sourceMap, result) {
  const map = getHeaderMap_(sheet);
  const rowKey = String(sourceRow);
  const outputRow = index.bySourceRow[rowKey] || sheet.getLastRow() + 1;
  const values = {
    'Source Row': sourceRow,
    'Verification Date': sourceMap['Verification Date'] ? sourceValues[sourceMap['Verification Date'] - 1] : '',
    'No': sourceMap['No'] ? sourceValues[sourceMap['No'] - 1] : '',
    'Team': sourceMap['Team'] ? sourceValues[sourceMap['Team'] - 1] : '',
    'Position': sourceMap['Position'] ? sourceValues[sourceMap['Position'] - 1] : '',
    'Company Name': sourceMap['Company Name'] ? sourceValues[sourceMap['Company Name'] - 1] : '',
    'Contact Type': sourceMap['Contact Type'] ? sourceValues[sourceMap['Contact Type'] - 1] : '',
    'Email': result.email || '',
    'Email Domain': result.emailDomain || '',
    'Email Format': result.formatValid === true ? 'VALID' : (result.formatValid === false ? 'INVALID' : ''),
    'Domain MX': result.hasMx === true ? 'ACTIVE' : (result.hasMx === false ? 'NO_MX' : ''),
    'Official Website': result.officialWebsite || '',
    'Website Match': result.websiteMatch || '',
    'LinkedIn Company': result.linkedinUrl || '',
    'LinkedIn Match': result.linkedinMatch || '',
    'Instagram': result.instagramUrl || '',
    'Instagram Match': result.instagramMatch || '',
    'AHU Status': result.ahuStatus || '',
    'AHU Registered Name': result.ahuRegisteredName || '',
    'AHU Evidence': result.ahuEvidence || '',
    'Entity Type': result.entityType || '',
    'Legal Entity Name': result.legalEntityName || '',
    'Legal Entity Type': result.legalEntityType || '',
    'Legal Relationship': result.legalRelationship || '',
    'AHU Number': result.ahuNumber || '',
    'Legal Evidence Source': result.legalEvidenceSource || '',
    'Legal Confidence': Number(result.legalConfidence || 0),
    'Company Presence Score': Number(result.presenceScore || 0),
    'Company Presence Status': result.presenceStatus || '',
    'Official Domain': result.officialDomain || '',
    'Domain Match': result.domainMatch === true ? 'MATCH' : (result.domainMatch === false ? 'NO_MATCH' : ''),
    'Exact Email Found': result.exactEmailFound === true ? 'FOUND' : (result.exactEmailFound === false ? 'NOT_FOUND' : ''),
    'Company Matched': booleanFlag_(result.companyMatched),
    'Other Company Suspected': booleanFlag_(result.otherCompanySuspected),
    'Evidence Type': result.evidenceType || '',
    'Evidence Source': result.evidenceSource || '',
    'Email on Website': evidenceFlag_(result.emailOnWebsite),
    'Website Evidence': result.websiteEvidence || '',
    'Email on LinkedIn': evidenceFlag_(result.emailOnLinkedin),
    'LinkedIn Evidence': result.linkedinEvidence || '',
    'Email on Instagram': evidenceFlag_(result.emailOnInstagram),
    'Instagram Evidence': result.instagramEvidence || '',
    'Other Email Evidence': result.otherEmailEvidence || '',
    'Validation Score': Number(result.score || 0),
    'Validation Status': result.status || '',
    'Validation Notes': result.notes || '',
    'Company Data Source': result.companyDataSource || '',
    'Email Data Source': result.emailDataSource || '',
    'Validator Version': result.validatorVersion || EMAIL_VALIDATOR_CONFIG.VERSION,
    'Last Checked': result.lastChecked || new Date()
  };
  Object.keys(values).forEach(function (header) {
    if (map[header]) sheet.getRange(outputRow, map[header]).setValue(values[header]);
  });

  const item = rawRowToResult_(EMAIL_VALIDATOR_CONFIG.RAW_HEADERS.map(function (header) { return values[header]; }),
    EMAIL_VALIDATOR_CONFIG.RAW_HEADERS.reduce(function (acc, header, i) { acc[header] = i + 1; return acc; }, {}));
  item.outputRow = outputRow;
  item.sourceRow = rowKey;
  item.companyName = cleanText_(values['Company Name']);
  index.rowsBySourceRow[rowKey] = item;
  index.bySourceRow[rowKey] = outputRow;
  const key = makeValidationKey_(item.companyName, item.email);
  if (key && item.status !== 'PROCESSING') index.byValidationKey[key] = item;
}

function rawRowToResult_(row, map) {
  return {
    email: normalizeEmail_(readMapped_(row, map, 'Email')),
    emailDomain: cleanText_(readMapped_(row, map, 'Email Domain')),
    formatValid: cleanText_(readMapped_(row, map, 'Email Format')).toUpperCase() === 'VALID',
    hasMx: cleanText_(readMapped_(row, map, 'Domain MX')).toUpperCase() === 'ACTIVE',
    officialWebsite: cleanText_(readMapped_(row, map, 'Official Website')),
    websiteMatch: cleanText_(readMapped_(row, map, 'Website Match')),
    linkedinUrl: cleanText_(readMapped_(row, map, 'LinkedIn Company')),
    linkedinMatch: cleanText_(readMapped_(row, map, 'LinkedIn Match')),
    instagramUrl: cleanText_(readMapped_(row, map, 'Instagram')),
    instagramMatch: cleanText_(readMapped_(row, map, 'Instagram Match')),
    ahuStatus: cleanText_(readMapped_(row, map, 'AHU Status')),
    ahuRegisteredName: cleanText_(readMapped_(row, map, 'AHU Registered Name')),
    ahuEvidence: cleanText_(readMapped_(row, map, 'AHU Evidence')),
    entityType: cleanText_(readMapped_(row, map, 'Entity Type')),
    legalEntityName: cleanText_(readMapped_(row, map, 'Legal Entity Name')),
    legalEntityType: cleanText_(readMapped_(row, map, 'Legal Entity Type')),
    legalRelationship: cleanText_(readMapped_(row, map, 'Legal Relationship')),
    ahuNumber: cleanText_(readMapped_(row, map, 'AHU Number')),
    legalEvidenceSource: cleanText_(readMapped_(row, map, 'Legal Evidence Source')),
    legalConfidence: Number(readMapped_(row, map, 'Legal Confidence') || 0),
    presenceScore: Number(readMapped_(row, map, 'Company Presence Score') || 0),
    presenceStatus: cleanText_(readMapped_(row, map, 'Company Presence Status')),
    officialDomain: cleanText_(readMapped_(row, map, 'Official Domain')),
    domainMatch: cleanText_(readMapped_(row, map, 'Domain Match')).toUpperCase() === 'MATCH',
    exactEmailFound: cleanText_(readMapped_(row, map, 'Exact Email Found')).toUpperCase() === 'FOUND',
    companyMatched: parseBooleanFlag_(readMapped_(row, map, 'Company Matched')),
    otherCompanySuspected: parseBooleanFlag_(readMapped_(row, map, 'Other Company Suspected')),
    evidenceType: cleanText_(readMapped_(row, map, 'Evidence Type')),
    evidenceSource: cleanText_(readMapped_(row, map, 'Evidence Source')),
    emailOnWebsite: parseEvidenceFlag_(readMapped_(row, map, 'Email on Website')),
    websiteEvidence: cleanText_(readMapped_(row, map, 'Website Evidence')),
    emailOnLinkedin: parseEvidenceFlag_(readMapped_(row, map, 'Email on LinkedIn')),
    linkedinEvidence: cleanText_(readMapped_(row, map, 'LinkedIn Evidence')),
    emailOnInstagram: parseEvidenceFlag_(readMapped_(row, map, 'Email on Instagram')),
    instagramEvidence: cleanText_(readMapped_(row, map, 'Instagram Evidence')),
    otherEmailEvidence: cleanText_(readMapped_(row, map, 'Other Email Evidence')),
    score: Number(readMapped_(row, map, 'Validation Score') || 0),
    status: cleanText_(readMapped_(row, map, 'Validation Status')),
    notes: cleanText_(readMapped_(row, map, 'Validation Notes')),
    companyDataSource: cleanText_(readMapped_(row, map, 'Company Data Source')),
    emailDataSource: cleanText_(readMapped_(row, map, 'Email Data Source')),
    validatorVersion: cleanText_(readMapped_(row, map, 'Validator Version')),
    lastChecked: readMapped_(row, map, 'Last Checked') || ''
  };
}

function legacyRowToResult_(row, map) {
  const result = rawRowToResult_(row, map);
  if (result.officialWebsite && isBlockedOfficialDomain_(getDomain_(result.officialWebsite))) {
    result.officialWebsite = '';
    result.officialDomain = '';
    result.websiteMatch = 'NOT_FOUND';
  }
  result.lastChecked = result.lastChecked || new Date();
  return result;
}

function resultToPresence_(result) {
  const websiteValid = result.officialWebsite && !isBlockedOfficialDomain_(getDomain_(result.officialWebsite));
  const linkedStrong = Boolean(result.linkedinUrl && /MATCH|OFFICIAL_LINK/.test(result.linkedinMatch || 'MATCH'));
  const instagramStrong = Boolean(result.instagramUrl && /MATCH|OFFICIAL_LINK/.test(result.instagramMatch || 'MATCH'));
  const ahuEvidence = isOfficialAhuEvidenceUrl_(result.ahuEvidence) ? result.ahuEvidence : '';
  const legalEvidenceSource = isLegalEvidenceSourceUrl_(result.legalEvidenceSource, result.companyName, result.officialDomain)
    ? result.legalEvidenceSource : '';
  const ahuStatus = ahuEvidence || legalEvidenceSource
    ? (cleanText_(result.ahuStatus).toUpperCase() || 'NOT_FOUND') : 'NOT_FOUND';
  const ahuStrong = /^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahuStatus);
  const strongCount = (websiteValid ? 1 : 0) + (linkedStrong ? 1 : 0) +
    (instagramStrong ? 1 : 0) + (ahuStrong ? 1 : 0);
  var status = 'NOT_FOUND';
  if (strongCount >= 2) status = 'VERIFIED_STRONG';
  else if (strongCount === 1) status = 'FOUND';
  else if (result.presenceStatus === 'REVIEW_REQUIRED' || /^(REVIEW|MANUAL_AHU_CHECK)$/.test(ahuStatus)) status = 'REVIEW_REQUIRED';

  return {
    website: {
      url: websiteValid ? result.officialWebsite : '',
      website: websiteValid ? result.officialWebsite : '',
      domain: websiteValid ? (result.officialDomain || getDomain_(result.officialWebsite)) : '',
      domainStem: websiteValid ? getDomainStem_(result.officialDomain || getDomain_(result.officialWebsite)) : '',
      status: websiteValid ? 'MATCH' : 'NOT_FOUND', score: websiteValid ? 60 : 0,
      source: websiteValid ? result.officialWebsite : ''
    },
    linkedin: {
      url: result.linkedinUrl || '',
      status: linkedStrong ? 'MATCH' : (result.linkedinUrl ? 'REVIEW' : 'NOT_FOUND'),
      score: linkedStrong ? 50 : 0, source: result.linkedinUrl || ''
    },
    instagram: {
      url: result.instagramUrl || '',
      status: instagramStrong ? 'MATCH' : (result.instagramUrl ? 'REVIEW' : 'NOT_FOUND'),
      score: instagramStrong ? 50 : 0, source: result.instagramUrl || ''
    },
    ahu: {
      status: ahuStatus,
      registeredName: result.ahuRegisteredName || '',
      legalEntityName: result.legalEntityName || result.ahuRegisteredName || '',
      legalEntityType: result.legalEntityType || extractAhuLegalForm_(result.ahuRegisteredName || ''),
      legalForm: result.legalEntityType || extractAhuLegalForm_(result.ahuRegisteredName || ''),
      parentEntity: result.legalRelationship === 'PARENT_ENTITY' ? (result.legalEntityName || '') : '',
      legalRelationship: result.legalRelationship || '',
      ahuNumber: result.ahuNumber || '',
      evidenceUrl: ahuEvidence,
      legalEvidenceSource: legalEvidenceSource,
      legalConfidence: Number(result.legalConfidence || 0),
      score: ahuStrong ? 25 : (/^(REVIEW|MANUAL_AHU_CHECK)$/.test(ahuStatus) ? 6 : 0)
    },
    entityType: result.entityType || resolveEntityType_(result.companyName, result.officialWebsite, ''),
    score: strongCount >= 2 ? 80 : (strongCount === 1 ? 50 : (/^(REVIEW|MANUAL_AHU_CHECK)$/.test(ahuStatus) ? 20 : 0)),
    status: status
  };
}

function copyRawResult_(cached) {
  return {
    email: cached.email || '', emailDomain: cached.emailDomain || '',
    formatValid: cached.formatValid, hasMx: cached.hasMx,
    officialWebsite: cached.officialWebsite || '', websiteMatch: cached.websiteMatch || '',
    linkedinUrl: cached.linkedinUrl || '', linkedinMatch: cached.linkedinMatch || '',
    instagramUrl: cached.instagramUrl || '', instagramMatch: cached.instagramMatch || '',
    ahuStatus: cached.ahuStatus || '', ahuRegisteredName: cached.ahuRegisteredName || '',
    ahuEvidence: cached.ahuEvidence || '',
    entityType: cached.entityType || '', legalEntityName: cached.legalEntityName || '',
    legalEntityType: cached.legalEntityType || '', legalRelationship: cached.legalRelationship || '',
    ahuNumber: cached.ahuNumber || '', legalEvidenceSource: cached.legalEvidenceSource || '',
    legalConfidence: Number(cached.legalConfidence || 0),
    presenceScore: Number(cached.presenceScore || 0), presenceStatus: cached.presenceStatus || '',
    officialDomain: cached.officialDomain || '', domainMatch: cached.domainMatch,
    exactEmailFound: cached.exactEmailFound, companyMatched: cached.companyMatched,
    otherCompanySuspected: cached.otherCompanySuspected, evidenceType: cached.evidenceType || '',
    evidenceSource: cached.evidenceSource || '',
    emailOnWebsite: cached.emailOnWebsite, websiteEvidence: cached.websiteEvidence || '',
    emailOnLinkedin: cached.emailOnLinkedin, linkedinEvidence: cached.linkedinEvidence || '',
    emailOnInstagram: cached.emailOnInstagram, instagramEvidence: cached.instagramEvidence || '',
    otherEmailEvidence: cached.otherEmailEvidence || '', score: Number(cached.score || 0),
    status: cached.status || '', notes: cached.notes || '',
    companyDataSource: cached.companyDataSource || '', emailDataSource: cached.emailDataSource || '',
    validatorVersion: EMAIL_VALIDATOR_CONFIG.VERSION, lastChecked: new Date()
  };
}

function isCompatibleValidatorVersion_(version) {
  const normalized = cleanText_(version);
  return EMAIL_VALIDATOR_CONFIG.CACHE_COMPATIBLE_VERSIONS.indexOf(normalized) !== -1;
}

function isCompatibleCompanyMasterCacheVersion_(version) {
  return EMAIL_VALIDATOR_CONFIG.COMPANY_CACHE_COMPATIBLE_VERSIONS.indexOf(cleanText_(version)) !== -1;
}

function isUsableEmailCache_(cached) {
  if (!cached || !isCompatibleValidatorVersion_(cached.validatorVersion)) return false;
  if (!cached.status || cached.status === 'ERROR' || cached.status === 'PROCESSING') return false;
  if (!cached.lastChecked) return false;
  const checked = new Date(cached.lastChecked);
  if (isNaN(checked.getTime())) return false;
  return Date.now() - checked.getTime() <=
    EMAIL_VALIDATOR_CONFIG.EMAIL_CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function emptyValidationResult_(email) {
  return {
    email: email || '', emailDomain: '', formatValid: null, hasMx: null,
    officialWebsite: '', websiteMatch: '', linkedinUrl: '', linkedinMatch: '',
    instagramUrl: '', instagramMatch: '',
    ahuStatus: '', ahuRegisteredName: '', ahuEvidence: '',
    entityType: '', legalEntityName: '', legalEntityType: '', legalRelationship: '',
    ahuNumber: '', legalEvidenceSource: '', legalConfidence: 0,
    presenceScore: 0, presenceStatus: '',
    officialDomain: '', domainMatch: null, exactEmailFound: null,
    companyMatched: null, otherCompanySuspected: null,
    evidenceType: '', evidenceSource: '',
    emailOnWebsite: null, websiteEvidence: '',
    emailOnLinkedin: null, linkedinEvidence: '',
    emailOnInstagram: null, instagramEvidence: '',
    otherEmailEvidence: '', score: 0, status: '', notes: '',
    companyDataSource: '', emailDataSource: '',
    validatorVersion: EMAIL_VALIDATOR_CONFIG.VERSION, lastChecked: new Date()
  };
}

function readMapped_(row, map, header) {
  const col = map[header];
  return col ? row[col - 1] : '';
}

function makeValidationKey_(companyName, email) {
  const companyKey = makeCompanyKey_(companyName);
  const normalizedEmail = normalizeEmail_(email);
  return companyKey && normalizedEmail ? companyKey + '|' + normalizedEmail : '';
}

function makeCompanyKey_(companyName) {
  return normalizeCompanyKey_(companyName);
}

function finishValidationBatch_(ss, state) {
  const runId = cleanText_(state && state.runId);
  if (runId && !isBatchRunActive_(runId)) {
    deleteBatchStateIfRunMatches_(runId);
    return;
  }

  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
  props.deleteProperty(EMAIL_VALIDATOR_CONFIG.LAST_ERROR_PROPERTY);
  if (!runId || isBatchRunActive_(runId)) {
    props.deleteProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY);
  }
  deleteValidatorContinuationTriggers_();
  updateSummarySheet_(ss);
  ss.toast(
    'Selesai. Terverifikasi: ' + state.verified +
    ', kemungkinan valid: ' + state.probable +
    ', cek manual: ' + state.manual +
    ', jangan digunakan: ' + state.blocked + '.',
    'Email Validator', 10
  );
}

function scheduleValidatorContinuation_(runId) {
  if (!isBatchRunActive_(runId)) return;
  deleteValidatorContinuationTriggers_();
  if (!isBatchRunActive_(runId)) return;

  ScriptApp.newTrigger(EMAIL_VALIDATOR_CONFIG.CONTINUE_HANDLER)
    .timeBased().after(EMAIL_VALIDATOR_CONFIG.CONTINUE_AFTER_MS).create();

  // Menutup race: kalau Stop terjadi persis saat trigger dibuat, hapus lagi.
  if (!isBatchRunActive_(runId)) deleteValidatorContinuationTriggers_();
}

function deleteValidatorContinuationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === EMAIL_VALIDATOR_CONFIG.CONTINUE_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function isBatchRunActive_(runId) {
  const id = cleanText_(runId);
  if (!id) return true; // pemrosesan manual/selected rows tidak memakai batch run.
  const active = cleanText_(PropertiesService.getScriptProperties().getProperty(
    EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY
  ));
  return Boolean(active && active === id);
}

function assertBatchRunActive_(runId) {
  if (!runId) return;
  if (!isBatchRunActive_(runId)) {
    const error = new Error('__EMAIL_VALIDATOR_STOPPED__');
    error.name = 'EmailValidatorStopped';
    throw error;
  }
}

function isBatchStoppedError_(error) {
  if (!error) return false;
  return error.name === 'EmailValidatorStopped' ||
    getErrorMessage_(error).indexOf('__EMAIL_VALIDATOR_STOPPED__') !== -1;
}

function persistBatchStateIfActive_(state) {
  const runId = cleanText_(state && state.runId);
  if (!isBatchRunActive_(runId)) {
    deleteBatchStateIfRunMatches_(runId);
    return false;
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY, JSON.stringify(state));

  // Stop bisa terjadi di antara check dan setProperty di atas.
  if (!isBatchRunActive_(runId)) {
    deleteBatchStateIfRunMatches_(runId);
    return false;
  }
  return true;
}

function deleteBatchStateIfRunMatches_(runId) {
  const id = cleanText_(runId);
  const props = PropertiesService.getScriptProperties();
  const stateText = props.getProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
  if (!stateText) return;

  try {
    const state = JSON.parse(stateText);
    if (!id || cleanText_(state.runId) === id) {
      props.deleteProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
      props.deleteProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
    }
  } catch (ignore) {
    if (!id) {
      props.deleteProperty(EMAIL_VALIDATOR_CONFIG.BATCH_STATE_PROPERTY);
      props.deleteProperty(EMAIL_VALIDATOR_CONFIG.SPREADSHEET_ID_PROPERTY);
    }
  }
}

function clearBatchRunIfMatches_(runId) {
  const id = cleanText_(runId);
  const props = PropertiesService.getScriptProperties();
  if (id && !isBatchRunActive_(id)) return;
  deleteBatchStateIfRunMatches_(id);
  if (!id || isBatchRunActive_(id)) props.deleteProperty(EMAIL_VALIDATOR_CONFIG.ACTIVE_RUN_ID_PROPERTY);
}

function getLastValidationDataRow_(sheet, headerMap) {
  const physicalLastRow = sheet.getLastRow();
  if (physicalLastRow < EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW) return 0;

  const companyCol = requireHeader_(headerMap, 'Company Name');
  const typeCol = requireHeader_(headerMap, 'Contact Type');
  const contactCol = requireHeader_(headerMap, 'Contact');
  const firstCol = Math.min(companyCol, typeCol, contactCol);
  const lastCol = Math.max(companyCol, typeCol, contactCol);
  const width = lastCol - firstCol + 1;
  const rowCount = physicalLastRow - EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + 1;
  const values = sheet.getRange(
    EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW, firstCol, rowCount, width
  ).getDisplayValues();

  const offsets = [companyCol, typeCol, contactCol].map(function (col) {
    return col - firstCol;
  });

  for (var i = values.length - 1; i >= 0; i--) {
    const hasValidationData = offsets.some(function (offset) {
      return cleanText_(values[i][offset]) !== '';
    });
    if (hasValidationData) return EMAIL_VALIDATOR_CONFIG.FIRST_DATA_ROW + i;
  }
  return 0;
}

function lookupMx_(domain, runId) {
  if (!domain) return { hasMx: false, records: [] };

  const url = 'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX';
  assertBatchRunActive_(runId);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Accept': 'application/dns-json' },
    muteHttpExceptions: true,
    followRedirects: true
  });

  assertBatchRunActive_(runId);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) return { hasMx: false, records: [] };

  const data = JSON.parse(response.getContentText() || '{}');
  const answers = Array.isArray(data.Answer) ? data.Answer : [];
  const records = answers
    .filter(function (item) { return Number(item.type) === 15 && item.data; })
    .map(function (item) { return String(item.data); });

  return { hasMx: records.length > 0, records: records };
}

function fetchOpenAIResponseWithRetry_(url, options, runId) {
  const maxAttempts = Math.max(1, Number(EMAIL_VALIDATOR_CONFIG.OPENAI_FETCH_MAX_ATTEMPTS) || 1);
  var lastTransportError = null;

  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    assertBatchRunActive_(runId);
    try {
      const response = UrlFetchApp.fetch(url, options);
      assertBatchRunActive_(runId);

      if (!isRetryableOpenAIResponse_(response) || attempt >= maxAttempts) return response;
      sleepBeforeOpenAIRetry_(attempt, getOpenAIRetryAfterMs_(response), runId);
    } catch (error) {
      if (isBatchStoppedError_(error)) throw error;
      if (!isRetryableOpenAITransportError_(error)) throw error;

      lastTransportError = error;
      if (attempt >= maxAttempts) {
        throw new Error(
          'OpenAI Web Search tidak dapat dijangkau setelah ' + maxAttempts +
          ' percobaan: ' + truncate_(getErrorMessage_(lastTransportError), 350)
        );
      }
      sleepBeforeOpenAIRetry_(attempt, 0, runId);
    }
  }

  throw lastTransportError || new Error('OpenAI Web Search gagal tanpa response.');
}

function isRetryableOpenAIResponse_(response) {
  const code = Number(response && response.getResponseCode ? response.getResponseCode() : 0);
  if ([408, 409, 425, 500, 502, 503, 504].indexOf(code) !== -1) return true;
  if (code !== 429) return false;

  // Limit billing/quota tidak pulih dengan retry. Rate limit sementara boleh.
  const body = response && response.getContentText ? cleanText_(response.getContentText()) : '';
  return !/(insufficient_quota|organization_spend_limit_exceeded|project_spend_limit_exceeded|organization_usage_limit_exceeded)/i.test(body);
}

function isRetryableOpenAITransportError_(error) {
  const message = getErrorMessage_(error).toLowerCase();
  return /(alamat tidak tersedia|address unavailable|timed?\s*out|timeout|connection|network|socket|dns|ssl|temporar(?:y|ily)|service unavailable)/i.test(message);
}

function getOpenAIRetryAfterMs_(response) {
  if (!response) return 0;
  var headers = {};
  try {
    headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
  } catch (error) { headers = {}; }

  var value = '';
  Object.keys(headers || {}).some(function (key) {
    if (String(key).toLowerCase() !== 'retry-after') return false;
    value = Array.isArray(headers[key]) ? headers[key][0] : headers[key];
    return true;
  });
  if (value === '' || value === null || typeof value === 'undefined') return 0;

  const seconds = Number(value);
  if (isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const retryDate = new Date(value);
  return isNaN(retryDate.getTime()) ? 0 : Math.max(0, retryDate.getTime() - Date.now());
}

function sleepBeforeOpenAIRetry_(attempt, retryAfterMs, runId) {
  const base = Math.max(100, Number(EMAIL_VALIDATOR_CONFIG.OPENAI_FETCH_BASE_DELAY_MS) || 1000);
  const maxDelay = Math.max(base, Number(EMAIL_VALIDATOR_CONFIG.OPENAI_FETCH_MAX_DELAY_MS) || 10000);
  const exponential = base * Math.pow(2, Math.max(0, Number(attempt) - 1));
  const jitter = Math.floor(Math.random() * 251);
  const delay = Math.min(maxDelay, Math.max(Number(retryAfterMs) || 0, exponential + jitter));
  assertBatchRunActive_(runId);
  Utilities.sleep(delay);
  assertBatchRunActive_(runId);
}

function openAIWebSearch_(query, runId) {
  assertBatchRunActive_(runId);
  const apiKey = assertValidatorApiKey_();
  const url = 'https://api.openai.com/v1/responses';
  const maxResults = EMAIL_VALIDATOR_CONFIG.MAX_SEARCH_RESULTS;

  const body = {
    model: EMAIL_VALIDATOR_CONFIG.OPENAI_MODEL,
    store: false,
    instructions: [
      'You are a web-search adapter for an email/company verification system.',
      'You MUST use web search for the supplied query.',
      'Return only source-backed web results. Never invent a URL, email address, company identity, or social profile.',
      'Preserve exact-email and site: search intent when it appears in the query.',
      'Prefer results relevant to Indonesia when location is ambiguous.',
      'Descriptions must summarize evidence visible from the searched source, not assumptions.',
      'Return no more than ' + maxResults + ' results.'
    ].join(' '),
    input: 'Search the web for this query and return the most relevant source-backed results: ' + query,
    tools: [{
      type: 'web_search',
      search_context_size: EMAIL_VALIDATOR_CONFIG.OPENAI_SEARCH_CONTEXT_SIZE,
      user_location: {
        type: 'approximate',
        country: 'ID',
        timezone: 'Asia/Jakarta'
      }
    }],
    tool_choice: 'required',
    // Beri ruang untuk agentic search menyelesaikan pencarian dan membentuk
    // jawaban. Batas 1 dapat menghasilkan response incomplete tanpa message.
    max_tool_calls: 3,
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        name: 'validator_web_search_results',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  description: { type: 'string' },
                  extra_snippets: { type: 'array', items: { type: 'string' } }
                },
                required: ['title', 'url', 'description', 'extra_snippets'],
                additionalProperties: false
              }
            }
          },
          required: ['results'],
          additionalProperties: false
        }
      }
    }
  };

  const response = fetchOpenAIResponseWithRetry_(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Accept': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    followRedirects: true
  }, runId);

  assertBatchRunActive_(runId);
  const code = response.getResponseCode();
  const responseText = response.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('OpenAI Web Search gagal (' + code + '): ' + truncate_(responseText, 500));
  }

  const payload = JSON.parse(responseText || '{}');
  if (payload.error) {
    throw new Error('OpenAI Web Search gagal: ' + truncate_(payload.error.message || JSON.stringify(payload.error), 500));
  }
  if (payload.status === 'incomplete') {
    const reason = payload.incomplete_details && payload.incomplete_details.reason
      ? payload.incomplete_details.reason
      : 'unknown_reason';
    throw new Error('OpenAI Web Search tidak selesai: ' + reason);
  }

  const sourceItems = collectOpenAIWebSources_(payload);
  const sourceSet = {};
  sourceItems.forEach(function (item) {
    const key = canonicalSourceUrl_(item.url);
    if (key) sourceSet[key] = true;
  });

  var parsedResults = [];
  const outputText = extractOpenAIResponseText_(payload);
  if (outputText) {
    try {
      const parsed = JSON.parse(outputText);
      parsedResults = parsed && Array.isArray(parsed.results) ? parsed.results : [];
    } catch (error) { console.warn(getErrorMessage_(error)); }
  }

  const hasSourceList = Object.keys(sourceSet).length > 0;
  if (!hasSourceList) {
    const outputItems = payload && Array.isArray(payload.output) ? payload.output : [];
    const hasWebSearchCall = outputItems.some(function (item) {
      return item && item.type === 'web_search_call';
    });
    // Pencarian completed yang memang tidak menemukan hasil adalah [] yang
    // valid (misalnya exact-email tidak publik). Structured URL tanpa source,
    // atau response tanpa web_search_call, tetap ditolak.
    if (!hasWebSearchCall || parsedResults.length) {
      throw new Error('OpenAI Web Search tidak mengembalikan source/citation yang mendukung hasil.');
    }
    return [];
  }
  const seen = {};
  const normalized = [];
  parsedResults.forEach(function (item) {
    if (normalized.length >= maxResults) return;
    const resultUrl = cleanText_(item && item.url);
    const backedSource = findSourceBacking_(sourceItems, resultUrl);
    const backedUrl = backedSource ? cleanText_(backedSource.url) : '';
    const key = canonicalSourceUrl_(backedUrl);
    if (!backedUrl || !key || seen[key]) return;

    seen[key] = true;
    normalized.push({
      title: cleanText_(item.title) || cleanText_(backedSource.title),
      // URL final selalu URL yang benar-benar ada di sources/citations.
      url: backedUrl,
      description: cleanText_(item.description),
      extra_snippets: Array.isArray(item.extra_snippets)
        ? item.extra_snippets.map(cleanText_).filter(Boolean).slice(0, 3)
        : []
    });
  });

  // Selalu append source yang belum masuk. Dengan demikian structured output
  // yang kosong/tidak cocok tidak menghilangkan URL hasil pencarian asli.
  sourceItems.forEach(function (item) {
    if (normalized.length >= maxResults) return;
    const key = canonicalSourceUrl_(item.url);
    if (!key || seen[key]) return;
    seen[key] = true;
    normalized.push({
      title: cleanText_(item.title),
      url: cleanText_(item.url),
      description: '',
      extra_snippets: []
    });
  });

  return normalized.slice(0, maxResults);
}

function extractOpenAIResponseText_(payload) {
  const parts = [];
  const output = payload && Array.isArray(payload.output) ? payload.output : [];
  output.forEach(function (item) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) return;
    item.content.forEach(function (content) {
      if (content && content.type === 'output_text' && content.text) parts.push(String(content.text));
    });
  });
  return parts.join('').trim();
}

function collectOpenAIWebSources_(payload) {
  const results = [];
  const seen = {};
  const output = payload && Array.isArray(payload.output) ? payload.output : [];

  function add(url, title) {
    const cleanUrl = cleanText_(url);
    const key = canonicalSourceUrl_(cleanUrl);
    if (!cleanUrl || !key || seen[key]) return;
    seen[key] = true;
    results.push({ url: cleanUrl, title: cleanText_(title) });
  }

  output.forEach(function (item) {
    if (!item) return;

    if (item.type === 'web_search_call' && item.action && Array.isArray(item.action.sources)) {
      item.action.sources.forEach(function (source) {
        if (source && source.url) add(source.url, source.title || '');
      });
    }

    if (item.type === 'message' && Array.isArray(item.content)) {
      item.content.forEach(function (content) {
        const annotations = content && Array.isArray(content.annotations) ? content.annotations : [];
        annotations.forEach(function (annotation) {
          if (annotation && annotation.type === 'url_citation' && annotation.url) {
            add(annotation.url, annotation.title || '');
          }
        });
      });
    }
  });

  return results;
}

function findSourceBacking_(sourceItems, resultUrl) {
  const resultKey = canonicalSourceUrl_(resultUrl);
  if (!resultKey) return null;

  for (var i = 0; i < sourceItems.length; i++) {
    if (canonicalSourceUrl_(sourceItems[i].url) === resultKey) return sourceItems[i];
  }

  // Root/subdomain canonicalization hanya aman untuk website biasa. Untuk
  // social profile, path profile harus tetap exact agar akun lain tidak ikut.
  const resultDomain = getDomain_(resultUrl);
  if (/linkedin\.com$|instagram\.com$/i.test(getRegistrableDomain_(resultDomain))) return null;
  const resultRoot = getRegistrableDomain_(resultDomain);
  if (!resultRoot) return null;
  for (var j = 0; j < sourceItems.length; j++) {
    if (getRegistrableDomain_(getDomain_(sourceItems[j].url)) === resultRoot) return sourceItems[j];
  }
  return null;
}

function canonicalSourceUrl_(url) {
  return cleanText_(url)
    .replace(/^https?:\/\/(www\.)?/i, '')
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+$/, '')
    .toLowerCase();
}

function resolveEntityType_(companyName, officialWebsite, location) {
  const identityName = companyName ? buildCompanyIdentity_(companyName).canonicalName : '';
  const text = normalizeText_([companyName, identityName, officialWebsite, location].join(' '));
  if (!text) return 'OTHER';
  if (/\b(kementerian|kemendik|dinas|pemerintah|pemprov|pemkab|pemkot|kelurahan|kecamatan|desa|badan\s+usaha\s+milik\s+negara|bumn|bumn daerah|bumd)\b/.test(text)) {
    return 'GOVERNMENT';
  }
  if (/\b(rumah\s+sakit|hospital|rsud|rs\s+umum|rs\s+khusus)\b/.test(text)) return 'HOSPITAL';
  if (/\b(klinik|clinic|puskesmas|praktek\s+dokter)\b/.test(text)) return 'CLINIC';
  if (/\b(universitas|university|institut|institute|akademi|college|politeknik|polytechnic)\b/.test(text)) {
    return 'UNIVERSITY';
  }
  if (/\b(sekolah|school|sma|smk|smp|sd|madrasah|pesantren|boarding\s+school)\b/.test(text)) return 'SCHOOL';
  if (/\b(yayasan|foundation)\b/.test(text)) return 'FOUNDATION';
  if (/\b(perkumpulan|asosiasi|association|persyarikatan|serikat)\b/.test(text)) return 'ASSOCIATION';
  if (/\b(koperasi|cooperative)\b/.test(text)) return 'COOPERATIVE';
  if (/\b(organisasi|organization|lembaga|forum|komunitas|community)\b/.test(text)) return 'ORGANIZATION';
  if (/\b(pt|cv|tbk|perusahaan|company|corporation|corp|perseroan|perum|bumn|bumd)\b/.test(text)) return 'COMPANY';
  if (/\.ac\.id\b/.test(text)) return 'UNIVERSITY';
  if (/\.sch\.id\b/.test(text)) return 'SCHOOL';
  return 'OTHER';
}

function isEducationalEntityType_(entityType) {
  return /^(UNIVERSITY|SCHOOL)$/.test(cleanText_(entityType).toUpperCase());
}

function buildCompanyIdentity_(companyName) {
  const rawName = cleanText_(companyName);
  const normalizedName = normalizeText_(rawName);
  const groups = COMPANY_ALIAS_GROUPS_.slice().sort(function (a, b) {
    return b.aliases.reduce(function (max, alias) {
      return Math.max(max, normalizeText_(alias).length);
    }, 0) - a.aliases.reduce(function (max, alias) {
      return Math.max(max, normalizeText_(alias).length);
    }, 0);
  });
  const group = groups.find(function (candidate) {
    return candidate.aliases.some(function (alias) {
      const aliasKey = normalizeText_(alias);
      return aliasKey && (normalizedName === aliasKey || containsNormalizedPhrase_(normalizedName, aliasKey));
    });
  });
  const canonicalName = group ? group.canonicalName : rawName;
  const generatedAcronym = buildCompanyAcronym_(canonicalName);
  const aliases = unique_([
    rawName,
    canonicalName
  ].concat(group ? group.aliases : [], generatedAcronym || []).map(cleanText_).filter(Boolean));
  const domainStems = unique_((group ? group.domainStems : []).concat(generatedAcronym || []));

  return {
    canonicalName: canonicalName,
    canonicalKey: normalizeText_(canonicalName),
    aliases: aliases,
    nameKeys: aliases.map(normalizeText_).filter(Boolean),
    fullNameTokens: tokenizeCompanyName_(canonicalName),
    domainStems: domainStems.map(function (stem) {
      return cleanText_(stem).toLowerCase();
    }).filter(Boolean)
  };
}

function buildCompanyAcronym_(companyName) {
  const tokens = normalizeText_(companyName).split(/\s+/).filter(function (token) {
    return token.length >= 2 && ['pt', 'cv', 'tbk', 'the', 'and', 'dan'].indexOf(token) === -1;
  });
  if (tokens.length < 2 || tokens.length > 8) return '';
  const acronym = tokens.map(function (token) { return token.charAt(0); }).join('');
  return acronym.length >= 2 && acronym.length <= 8 ? acronym.toUpperCase() : '';
}

function getCompanyIdentityMatch_(identity, text, domain) {
  const normalized = normalizeText_(text);
  const fullNameSupported = Boolean(
    containsNormalizedPhrase_(normalized, identity.canonicalKey) ||
    (identity.fullNameTokens.length > 0 &&
      countTokenMatches_(identity.fullNameTokens, normalized) >=
      requiredCompanyTokenMatches_(identity.fullNameTokens))
  );
  var matchedTerm = '';
  identity.nameKeys.slice().sort(function (a, b) { return b.length - a.length; }).some(function (key) {
    if (containsNormalizedPhrase_(normalized, key)) {
      matchedTerm = key;
      return true;
    }
    return false;
  });

  var aliasTokenMatch = false;
  var tokenMatchedTerm = '';
  if (!matchedTerm) {
    aliasTokenMatch = identity.nameKeys.some(function (key) {
      const tokens = tokenizeCompanyName_(key);
      const matches = tokens.length > 0 && countTokenMatches_(tokens, normalized) >= requiredCompanyTokenMatches_(tokens);
      if (matches) tokenMatchedTerm = key;
      return matches;
    });
  }
  const matchedDomainStem = identity.domainStems.find(function (stem) {
    return domainStemMatches_(domain, stem);
  }) || '';
  const matched = Boolean(matchedTerm || aliasTokenMatch || matchedDomainStem);
  const aliasMatched = Boolean(
    matched && matchedTerm && matchedTerm !== identity.canonicalKey
  ) || Boolean(matchedDomainStem && !fullNameSupported);

  return {
    matched: matched,
    matchedTerm: matchedTerm || tokenMatchedTerm || matchedDomainStem,
    matchedDomainStem: matchedDomainStem,
    aliasMatched: aliasMatched,
    fullNameSupported: fullNameSupported,
    tokenMatches: countTokenMatches_(identity.fullNameTokens, normalized)
  };
}

function buildCompanySearchQuery_(companyName, location, suffix) {
  const identity = buildCompanyIdentity_(companyName);
  const names = identity.aliases.slice(0, 6).map(function (alias) {
    return '"' + sanitizeSearchPhrase_(alias) + '"';
  });
  const stems = identity.domainStems.slice(0, 4).map(function (stem) {
    return '"' + sanitizeSearchPhrase_(stem) + '"';
  });
  return [
    names.length ? '(' + names.join(' OR ') + ')' : '',
    cleanText_(location),
    stems.length ? '(' + stems.join(' OR ') + ' official domain)' : '',
    cleanText_(suffix)
  ].filter(Boolean).join(' ');
}

function buildDirectCompanySearchQuery_(companyName, location, suffix) {
  const identity = buildCompanyIdentity_(companyName);
  return [
    '"' + sanitizeSearchPhrase_(identity.canonicalName || companyName) + '"',
    cleanText_(location),
    cleanText_(suffix)
  ].filter(Boolean).join(' ');
}

function buildAhuSearchQuery_(companyName, location, fallback) {
  const identity = buildCompanyIdentity_(companyName);
  const aliases = (fallback ? identity.aliases : [companyName]).slice(0, 6).map(function (alias) {
    return '"' + sanitizeSearchPhrase_(alias) + '"';
  });
  const parents = getAhuParentEntities_(companyName).slice(0, 6).map(function (parent) {
    return '"' + sanitizeSearchPhrase_(parent) + '"';
  });
  const legalForms = AHU_LEGAL_FORM_TERMS_.join(' OR ');
  return [
    'site:ahu.go.id',
    aliases.length ? '(' + aliases.join(' OR ') + ')' : '',
    cleanText_(location),
    fallback && parents.length ? '(' + parents.join(' OR ') + ')' : '',
    '(' + legalForms + ')'
  ].filter(Boolean).join(' ');
}

function buildLegalEntitySearchQuery_(companyName, location, entityType, fallback) {
  const identity = buildCompanyIdentity_(companyName);
  const names = (fallback ? identity.aliases : [companyName]).slice(0, 8).map(function (alias) {
    return '"' + sanitizeSearchPhrase_(alias) + '"';
  });
  const parents = fallback ? getAhuParentEntities_(companyName).slice(0, 8).map(function (parent) {
    return '"' + sanitizeSearchPhrase_(parent) + '"';
  }) : [];
  const legalTerms = [
    '"badan hukum"', '"badan penyelenggara"', 'yayasan', 'perkumpulan',
    'persyarikatan', 'organisasi', 'koperasi', '"keputusan menteri"', 'AHU'
  ];
  const sourceHints = fallback ? ['site:ahu.go.id', 'site:go.id', 'site:ac.id', 'site:or.id'] : ['site:ahu.go.id'];
  return [
    '(' + sourceHints.join(' OR ') + ')',
    names.length ? '(' + names.join(' OR ') + ')' : '',
    cleanText_(location),
    parents.length ? '(' + parents.join(' OR ') + ')' : '',
    '(' + legalTerms.join(' OR ') + ')',
    cleanText_(entityType)
  ].filter(Boolean).join(' ');
}

function getAhuParentEntities_(companyName) {
  const identity = buildCompanyIdentity_(companyName);
  const normalized = normalizeText_([companyName, identity.canonicalName].join(' '));
  const parents = [];
  if (normalized.indexOf('muhammadiyah') !== -1) {
    parents.push('Persyarikatan Muhammadiyah', 'Pimpinan Pusat Muhammadiyah');
  }
  if (/universitas|sekolah|institut|akademi|madrasah/.test(normalized)) {
    parents.push(
      'Yayasan ' + identity.canonicalName,
      'Persyarikatan ' + identity.canonicalName,
      'Badan Hukum ' + identity.canonicalName
    );
  }
  parents.push(
    'PT ' + identity.canonicalName,
    'Yayasan ' + identity.canonicalName,
    'Perkumpulan ' + identity.canonicalName,
    'Koperasi ' + identity.canonicalName,
    'Persyarikatan ' + identity.canonicalName,
    'Organisasi ' + identity.canonicalName,
    'Badan Hukum ' + identity.canonicalName
  );
  return unique_(parents);
}

function findCompanyPresence_(companyName, location, runId) {
  const locationText = cleanText_(location);
  const entityType = resolveEntityType_(companyName, '', locationText);

  // Mulai dari nama lengkap agar query alias panjang tidak menenggelamkan hasil
  // resmi. Resolver alias/stem tetap menjadi fallback bila direct query gagal.
  var websiteResults = openAIWebSearch_(
    buildDirectCompanySearchQuery_(companyName, locationText, 'official website'), runId
  );
  var website = inferOfficialWebsite_(websiteResults, companyName, locationText);
  if (website.status !== 'MATCH') {
    const websiteFallbackResults = openAIWebSearch_(
      buildCompanySearchQuery_(companyName, locationText, 'official website'), runId
    );
    const websiteFallback = inferOfficialWebsite_(websiteFallbackResults, companyName, locationText);
    if ((websiteFallback.score || 0) > (website.score || 0)) website = websiteFallback;
  }
  const linkedProfiles = website.status === 'MATCH' && website.url
    ? extractSocialLinksFromWebsite_(website.url, runId)
    : { linkedin: '', instagram: '' };

  var linkedin;
  if (linkedProfiles.linkedin) {
    linkedin = { url: linkedProfiles.linkedin, status: 'OFFICIAL_LINK', score: 100, source: website.url };
  } else {
    const linkedinSiteQuery = isEducationalEntityType_(entityType)
      ? 'site:linkedin.com/school/'
      : 'site:linkedin.com/company/';
    var linkedinResults = openAIWebSearch_([
      linkedinSiteQuery,
      buildDirectCompanySearchQuery_(companyName, locationText, 'official profile')
    ].filter(Boolean).join(' '), runId);
    linkedin = inferSocialProfile_(linkedinResults, companyName, locationText, 'LINKEDIN');
    if (linkedin.status !== 'MATCH') {
      const linkedinFallbackResults = openAIWebSearch_([
        isEducationalEntityType_(entityType)
          ? '(site:linkedin.com/school/ OR site:linkedin.com/company/)'
          : 'site:linkedin.com/company/',
        buildCompanySearchQuery_(companyName, locationText, ''),
        'official profile'
      ].filter(Boolean).join(' '), runId);
      const linkedinFallback = inferSocialProfile_(
        linkedinFallbackResults, companyName, locationText, 'LINKEDIN'
      );
      if ((linkedinFallback.score || 0) > (linkedin.score || 0)) linkedin = linkedinFallback;
    }
  }

  var instagram;
  if (linkedProfiles.instagram) {
    instagram = { url: linkedProfiles.instagram, status: 'OFFICIAL_LINK', score: 100, source: website.url };
  } else {
    const instagramResults = openAIWebSearch_([
      'site:instagram.com',
      buildCompanySearchQuery_(companyName, locationText, 'official profile')
    ].filter(Boolean).join(' '), runId);
    instagram = inferSocialProfile_(instagramResults, companyName, locationText, 'INSTAGRAM');
  }

  // Resolver legal dimulai dari nama operasional di AHU. Jika belum cukup,
  // fallback memperluas alias, lokasi, dan badan hukum induk. Semua URL tetap
  // berasal dari source/citation Web Search; tidak ada URL yang dibuat model.
  const ahu = resolveLegalEntityPresence_(companyName, locationText, entityType, website.domain, runId);

  var score = 0;
  if (website.status === 'MATCH') score += 45;
  else if (website.status === 'REVIEW') score += 15;

  if (linkedin.status === 'OFFICIAL_LINK') score += 30;
  else if (linkedin.status === 'MATCH') score += 25;
  else if (linkedin.status === 'REVIEW') score += 8;

  if (instagram.status === 'OFFICIAL_LINK') score += 30;
  else if (instagram.status === 'MATCH') score += 25;
  else if (instagram.status === 'REVIEW') score += 8;

  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahu.status)) score += 25;
  else if (/^(REVIEW|MANUAL_AHU_CHECK)$/.test(ahu.status)) score += 6;

  score = Math.min(100, score);

  const strongCount = [website, linkedin, instagram].filter(function (item) {
    return item.status === 'MATCH' || item.status === 'OFFICIAL_LINK';
  }).length + (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahu.status) ? 1 : 0);

  var presenceStatus = 'NOT_FOUND';
  if (strongCount >= 2 || (website.status === 'MATCH' && score >= 65)) {
    presenceStatus = 'VERIFIED_STRONG';
  } else if (strongCount === 1) {
    presenceStatus = 'FOUND';
  } else if (score > 0) {
    presenceStatus = 'REVIEW_REQUIRED';
  }

  return {
    website: website,
    linkedin: linkedin,
    instagram: instagram,
    ahu: ahu,
    entityType: entityType,
    companyAlias: buildCompanyIdentity_(companyName).aliases.join(' | '),
    score: score,
    status: presenceStatus
  };
}


function resolveLegalEntityPresence_(companyName, location, entityType, officialDomain, runId) {
  if (cleanText_(entityType).toUpperCase() === 'GOVERNMENT') {
    return emptyLegalPresence_('NOT_APPLICABLE');
  }

  const initialResults = openAIWebSearch_(
    buildAhuSearchQuery_(companyName, location, false), runId
  );
  var legal = inferLegalEntityPresence_(initialResults, companyName, location, entityType, officialDomain);
  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(legal.status)) return legal;

  const fallbackResults = openAIWebSearch_(
    buildLegalEntitySearchQuery_(companyName, location, entityType, true), runId
  );
  const merged = mergeSearchResults_(initialResults, fallbackResults);
  legal = inferLegalEntityPresence_(merged, companyName, location, entityType, officialDomain);
  legal.fallbackUsed = true;
  return legal;
}

function mergeSearchResults_(first, second) {
  const merged = [];
  const seen = {};
  (first || []).concat(second || []).forEach(function (item) {
    const key = canonicalSourceUrl_(item && item.url);
    if (!key || seen[key]) return;
    seen[key] = true;
    merged.push(item);
  });
  return merged;
}

function inferAhuPresence_(results, companyName, location) {
  // Compatibility wrapper: fungsi bernama AHU hanya boleh menganggap URL
  // ahu.go.id sebagai bukti AHU. Resolver legal baru memakai fungsi di bawah
  // ini untuk sumber pemerintah/official lain tanpa mengisi AHU Evidence.
  const ahuResults = (results || []).filter(function (item) {
    return isOfficialAhuEvidenceUrl_(item && item.url);
  });
  return inferLegalEntityPresence_(ahuResults, companyName, location,
    resolveEntityType_(companyName, '', location), '');
}

function inferLegalEntityPresence_(results, companyName, location, entityType, officialDomain) {
  const normalizedEntityType = cleanText_(entityType).toUpperCase() || resolveEntityType_(companyName, '', location);
  if (normalizedEntityType === 'GOVERNMENT') return emptyLegalPresence_('NOT_APPLICABLE');

  const identity = buildCompanyIdentity_(companyName);
  const locationTokens = tokenizeLocation_(location);
  const parentEntities = getAhuParentEntities_(companyName);
  const candidates = [];
  const manualCandidates = [];
  const seen = {};

  (results || []).forEach(function (item, index) {
    const url = cleanText_(item && item.url);
    const domain = getDomain_(url);
    const isAhu = isOfficialAhuEvidenceUrl_(url);
    if (!url || !domain || !isLegalEvidenceSourceUrl_(url, companyName, officialDomain)) return;

    const canonical = canonicalSourceUrl_(url);
    if (!canonical || seen[canonical]) return;
    seen[canonical] = true;

    const rawTitle = cleanText_(item.title || '');
    const rawDescription = cleanText_(item.description || '');
    const snippets = Array.isArray(item.extra_snippets) ? item.extra_snippets.join(' ') : '';
    const evidenceText = cleanText_([rawTitle, rawDescription, snippets].join(' '));
    const normalizedEvidence = normalizeText_([evidenceText, url].join(' '));
    const identityMatch = getCompanyIdentityMatch_(identity, [evidenceText, url].join(' '), domain);
    const parentEntity = parentEntities.find(function (parent) {
      return containsNormalizedPhrase_(normalizedEvidence, normalizeText_(parent));
    }) || '';
    const locationMatches = countTokenMatches_(locationTokens, normalizedEvidence);
    const legalForm = extractAhuLegalForm_(evidenceText);
    const legalSignal = Boolean(legalForm) ||
      /\b(sertifikat|terdaftar|berkedudukan|profil|nomor\s+ahu|daftar\s+perseroan|badan\s+hukum|badan\s+penyelenggara|penyelenggara|didirikan|akta|keputusan\s+menteri|surat\s+keputusan|sk\s+menteri)\b/i
        .test(evidenceText);
    const manualSignal = isAhu && /captcha|verifikasi|akses\s+ditolak|forbidden|login|detail\s+(?:tidak|belum)|tidak\s+ditemukan|no\s+result|hasil\s+pencarian/i.test(evidenceText);
    const supportedAlias = identityMatch.matched &&
      (!identityMatch.aliasMatched || identityMatch.fullNameSupported || parentEntity || locationMatches > 0);
    if (!identityMatch.matched && !parentEntity) return;
    if (!supportedAlias && !parentEntity) return;

    var score = identityMatch.tokenMatches * 15 + Math.max(0, 8 - index);
    if (identityMatch.fullNameSupported) score += 32;
    if (identityMatch.aliasMatched) score += 8;
    if (identityMatch.matchedDomainStem) score += 12;
    if (parentEntity) score += 26;
    if (legalForm) score += 22;
    if (legalSignal) score += 16;
    if (locationMatches) score += Math.min(12, locationMatches * 4);
    if (isAhu) score += 10;
    else if (sameRegistrableDomain_(domain, officialDomain)) score += 12;
    else if (/\.go\.id$|\.gov\.id$/.test(domain)) score += 8;

    const registeredName = extractAhuRegisteredName_(evidenceText, companyName);
    const legalEntityName = parentEntity && legalSignal
      ? parentEntity : (legalForm && registeredName ? registeredName : '');
    const relationship = parentEntity || /\b(badan\s+penyelenggara|penyelenggara|naungan|berada\s+di\s+bawah|didirikan\s+oleh|milik|persyarikatan)\b/i.test(evidenceText)
      ? 'PARENT_ENTITY' : (legalSignal ? 'DIRECT_ENTITY' : '');
    const strongDirect = identityMatch.fullNameSupported && !parentEntity &&
      relationship !== 'PARENT_ENTITY' && legalSignal && score >= 55;
    const strongParent = Boolean(parentEntity || relationship === 'PARENT_ENTITY') &&
      (identityMatch.matched || locationMatches > 0) && legalSignal && score >= 55;
    var status = strongDirect ? 'DIRECT_MATCH' : (strongParent ? 'PARENT_ENTITY_MATCH' : 'REVIEW');
    if (manualSignal && !strongDirect && !strongParent) status = 'MANUAL_AHU_CHECK';
    if (status === 'REVIEW' && score < 30 && !manualSignal) return;

    const candidate = {
      status: status,
      registeredName: registeredName,
      legalEntityName: legalEntityName,
      legalForm: legalForm,
      legalEntityType: legalForm || inferLegalEntityType_(legalEntityName, normalizedEntityType),
      parentEntity: parentEntity,
      legalRelationship: relationship,
      ahuNumber: extractAhuNumber_(evidenceText),
      evidenceUrl: isAhu ? url : '',
      ahuEvidence: isAhu ? url : '',
      legalEvidenceSource: url,
      legalConfidence: status === 'DIRECT_MATCH' ? Math.min(100, Math.max(75, score))
        : (status === 'PARENT_ENTITY_MATCH' ? Math.min(95, Math.max(65, score))
          : (status === 'MANUAL_AHU_CHECK' ? 35 : Math.min(70, Math.max(40, score)))),
      score: Math.min(100, score),
      source: url,
      fallbackUsed: false
    };
    if (status === 'MANUAL_AHU_CHECK') manualCandidates.push(candidate);
    else candidates.push(candidate);
  });

  const rank = {
    DIRECT_MATCH: 5, PARENT_ENTITY_MATCH: 4, REVIEW: 3,
    MANUAL_AHU_CHECK: 2, NOT_FOUND: 1, NOT_APPLICABLE: 0
  };
  candidates.sort(function (a, b) {
    return (rank[b.status] - rank[a.status]) || (b.score - a.score);
  });
  if (candidates.length) return candidates[0];
  if (manualCandidates.length) {
    manualCandidates.sort(function (a, b) { return b.score - a.score; });
    return manualCandidates[0];
  }
  return emptyLegalPresence_('NOT_FOUND');
}

function emptyLegalPresence_(status) {
  return {
    status: status || 'NOT_FOUND',
    registeredName: '',
    legalEntityName: '',
    legalForm: '',
    legalEntityType: '',
    parentEntity: '',
    legalRelationship: '',
    ahuNumber: '',
    evidenceUrl: '',
    ahuEvidence: '',
    legalEvidenceSource: '',
    legalConfidence: 0,
    score: 0,
    source: '',
    fallbackUsed: false
  };
}

function isOfficialAhuDomain_(domain) {
  const value = String(domain || '').toLowerCase().replace(/^www\./, '');
  return value === 'ahu.go.id' || endsWithText_(value, '.ahu.go.id');
}

function isOfficialAhuEvidenceUrl_(url) {
  return Boolean(cleanText_(url) && isOfficialAhuDomain_(getDomain_(url)));
}

function isLegalEvidenceSourceUrl_(url, companyName, officialDomain) {
  const value = cleanText_(url);
  const domain = getDomain_(value);
  if (!value || !domain || !isSafePublicUrl_(value)) return false;
  if (isOfficialAhuDomain_(domain)) return true;
  if (officialDomain && sameRegistrableDomain_(domain, officialDomain)) return true;
  if (/\.(?:go|gov)\.id$/.test(domain)) return true;
  if (/\.(?:ac|sch|or)\.id$/.test(domain)) return true;

  // Sumber organisasi resmi yang tidak memakai subdomain .or.id tetap boleh
  // menjadi legalEvidenceSource, tetapi hanya bila identitas organisasi jelas.
  const identity = buildCompanyIdentity_(companyName || '');
  const normalizedDomain = normalizeText_(domain);
  return identity.domainStems.some(function (stem) {
    return stem && normalizedDomain.indexOf(normalizeText_(stem)) !== -1;
  }) && /\.(?:org|com|id)$/.test(domain);
}

function inferLegalEntityType_(legalEntityName, fallbackEntityType) {
  const form = extractAhuLegalForm_(legalEntityName || '');
  if (form) return form;
  const value = cleanText_(fallbackEntityType).toUpperCase();
  return ENTITY_TYPES_.indexOf(value) !== -1 ? value : '';
}

function extractAhuNumber_(evidenceText) {
  const text = cleanText_(evidenceText).replace(/\s+/g, ' ');
  if (!text) return '';
  const match = text.match(/\b(?:AHU(?:[-/ ]?\d+)?|Nomor\s+(?:AHU|SK|Keputusan)|No\.?\s*(?:AHU|SK))\s*[:#№-]?\s*[A-Z0-9./-]{3,80}/i);
  return match ? cleanText_(match[0]) : '';
}

function extractAhuLegalForm_(evidenceText) {
  const text = cleanText_(evidenceText).toUpperCase();
  if (!text) return '';
  const patterns = [
    /\bPERSEROAN\s+TERBATAS\b/,
    /\bPERUSAHAAN\s+UMUM\b/,
    /\bBADAN\s+HUKUM\b/,
    /\bPERSYARIKATAN\b/,
    /\bPERKUMPULAN\b/,
    /\bKOPERASI\b/,
    /\bYAYASAN\b/,
    /\bORGANISASI\b/,
    /\b(?:PT|CV|TBK|PERUM|BUMN|BUMD)\b/
  ];
  for (var i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) return cleanText_(match[0]);
  }
  return '';
}

function extractAhuRegisteredName_(evidenceText, companyName) {
  const text = cleanText_(evidenceText).replace(/\s+/g, ' ');
  if (!text) return '';

  const identity = buildCompanyIdentity_(companyName || '');
  const knownNames = unique_([companyName, identity.canonicalName].map(cleanText_).filter(Boolean))
    .sort(function (a, b) { return b.length - a.length; });
  const legalPrefixes = '(?:PT|CV|TBK|PERUM|BUMN|BUMD|YAYASAN|PERKUMPULAN|KOPERASI|PERSYARIKATAN|ORGANISASI|BADAN\\s+HUKUM|PERSEROAN\\s+TERBATAS|PERUSAHAAN\\s+UMUM)';
  for (var i = 0; i < knownNames.length; i++) {
    const namePattern = escapeRegExp_(knownNames[i]).replace(/\s+/g, '\\s+');
    const knownMatch = text.match(new RegExp('\\b(' + legalPrefixes + '\\s+' + namePattern + ')(?=\\s|[,|;.]|$)', 'i'));
    if (knownMatch) return cleanText_(knownMatch[1]).replace(/[.,;:-]+$/, '');
  }

  const legalNameMatch = text.match(
    /\b((?:(?:PT|CV|TBK|PERUM|BUMN|BUMD|YAYASAN|PERKUMPULAN|KOPERASI|PERSYARIKATAN|ORGANISASI|BADAN\s+HUKUM|PERSEROAN\s+TERBATAS|PERUSAHAAN\s+UMUM)\s+)[A-Z0-9][A-Z0-9 .,&()\/'-]{2,140}?)(?=\s+(?:BERKEDUDUKAN|TELAH|TERDAFTAR|NOMOR|ADALAH|YANG|SEBAGAI|PENYELENGGARA|DIDIRIKAN)\b|[|;,.]|$)/i
  );
  if (legalNameMatch) return cleanText_(legalNameMatch[1]).replace(/[.,;:-]+$/, '');

  const companyKey = normalizeCompanyKey_(companyName);
  return companyKey && normalizeText_(text).indexOf(companyKey) !== -1
    ? cleanText_(companyName)
    : '';
}

function inferOfficialWebsite_(results, companyName, location) {
  const identity = buildCompanyIdentity_(companyName);
  const locationTokens = tokenizeLocation_(location);
  const candidates = [];
  const seen = {};

  results.forEach(function (item, index) {
    const url = cleanText_(item.url);
    const domain = getDomain_(url);
    const rootDomain = getRegistrableDomain_(domain);
    if (!url || !domain || !rootDomain || isBlockedOfficialUrl_(url) || seen[canonicalSourceUrl_(url)]) return;

    const title = normalizeText_(item.title || '');
    const description = normalizeText_(item.description || '');
    const haystack = normalizeText_([title, description, url].join(' '));

    const identityMatch = getCompanyIdentityMatch_(identity, [title, description, url].join(' '), rootDomain);
    if (!identityMatch.matched) return;

    const domainMatches = identityMatch.matchedDomainStem ? 1 : 0;
    const locationMatches = countTokenMatches_(locationTokens, haystack);
    const exactNameInTitle = containsNormalizedPhrase_(title, identity.canonicalKey);
    const officialClaim = /\bofficial\b|\bresmi\b/.test(haystack);
    const rootRank = domain === rootDomain ? 2 : 1;
    const campaignSubdomain = isCampaignOrUtilitySubdomain_(domain);

    // Website resmi harus memiliki sinyal kuat. Ini mencegah direktori wisata/lowongan
    // yang hanya menyebut nama perusahaan dipilih sebagai website resmi.
    if (!domainMatches && !exactNameInTitle && !identityMatch.fullNameSupported && !officialClaim) return;

    var score = identityMatch.tokenMatches * 14 + Math.max(0, 10 - index);
    score += domainMatches * 35;
    score += rootRank === 2 ? 45 : 12;
    if (exactNameInTitle) score += 20;
    if (identityMatch.aliasMatched) score += 10;
    if (officialClaim) score += 8;
    if (locationMatches) score += Math.min(8, locationMatches * 3);
    if (/\.co\.id$|\.id$/.test(domain)) score += 2;
    if (campaignSubdomain) score -= 25;

    const hasStrongOwnershipSignal = domainMatches > 0 || officialClaim || rootRank === 2;
    const status = score >= 55 && hasStrongOwnershipSignal ? 'MATCH' : 'REVIEW';
    seen[canonicalSourceUrl_(url)] = true;
    const canonicalWebsite = rootRank === 2 ? getOrigin_(url) : 'https://' + rootDomain;
    candidates.push({
      url: canonicalWebsite,
      website: canonicalWebsite,
      domain: rootDomain,
      sourceDomain: domain,
      rootDomain: rootDomain,
      rootRank: rootRank,
      campaignSubdomain: campaignSubdomain,
      domainStem: getDomainStem_(rootDomain),
      status: status,
      score: score,
      source: url
    });
  });

  candidates.sort(function (a, b) {
    if (a.rootDomain === b.rootDomain && a.rootRank !== b.rootRank) return b.rootRank - a.rootRank;
    if (a.status !== b.status) return a.status === 'MATCH' ? -1 : 1;
    return b.score - a.score;
  });
  return candidates.length ? candidates[0] : {
    url: '',
    website: '',
    domain: '',
    domainStem: '',
    status: 'NOT_FOUND',
    score: 0,
    source: ''
  };
}

function inferSocialProfile_(results, companyName, location, platform) {
  const identity = buildCompanyIdentity_(companyName);
  const locationTokens = tokenizeLocation_(location);
  const isInstagram = String(platform).toUpperCase() === 'INSTAGRAM';
  const candidates = [];
  const seen = {};

  results.forEach(function (item, index) {
    const rawUrl = cleanText_(item.url);
    const normalizedUrl = normalizeSocialProfileUrl_(rawUrl, platform);
    if (!normalizedUrl || seen[normalizedUrl]) return;
    const linkedinProfileType = String(platform).toUpperCase() === 'LINKEDIN'
      ? ((normalizedUrl.match(/linkedin\.com\/(company|school)\//i) || [])[1] || '').toLowerCase()
      : '';
    const requestedEntityType = resolveEntityType_(companyName, '', location);
    if (linkedinProfileType === 'school' && !isEducationalEntityType_(requestedEntityType)) return;

    const title = normalizeText_(item.title || '');
    const description = normalizeText_(item.description || '');
    const slug = normalizeText_(getSocialSlug_(normalizedUrl, platform));

    // Identitas utama wajib datang dari TITLE/SLUG. Description dan lokasi
    // hanya dipakai sebagai konteks pendukung, khususnya untuk alias Instagram.
    const identityText = normalizeText_([title, slug].join(' '));
    const identityMatch = getCompanyIdentityMatch_(identity, identityText, '');
    if (!identityMatch.matched) return;

    const matchedTermTokens = tokenizeCompanyName_(identityMatch.matchedTerm);
    const identityMatches = matchedTermTokens.length
      ? countTokenMatches_(matchedTermTokens, identityText)
      : identityMatch.tokenMatches;
    const slugMatches = matchedTermTokens.length
      ? countTokenMatches_(matchedTermTokens, slug)
      : 0;
    // Hanya teks dari source yang boleh menjadi supporting evidence. Jangan
    // memasukkan location input karena itu membuat setiap alias pendek seolah
    // selalu didukung lokasi yang sedang dicari.
    const supportText = normalizeText_([title, description].join(' '));
    const fullNameSupported = Boolean(
      containsNormalizedPhrase_(supportText, identity.canonicalKey) ||
      (identity.fullNameTokens.length > 0 &&
        countTokenMatches_(identity.fullNameTokens, supportText) >=
        requiredCompanyTokenMatches_(identity.fullNameTokens))
    );
    const descriptionMatches = countTokenMatches_(identity.fullNameTokens, description);
    const descriptionSupports = identity.fullNameTokens.length > 0 &&
      descriptionMatches >= Math.min(2, identity.fullNameTokens.length);
    const locationMatches = countTokenMatches_(locationTokens, supportText);
    const locationSupports = locationTokens.length > 0 && locationMatches > 0;
    const contextSupported = fullNameSupported || descriptionSupports || locationSupports;

    var score = 0;

    // Bukti identitas utama
    score += identityMatches * 18;
    score += slugMatches * 18;
    if (identityMatch.aliasMatched) score += 20;

    if (containsNormalizedPhrase_(title, identity.canonicalKey)) score += 30;
    if (containsNormalizedPhrase_(slug, identity.canonicalKey)) score += 35;

    // Description/lokasi adalah bonus konteks; untuk alias Instagram konteks
    // ini wajib sebelum status dapat menjadi MATCH.
    score += Math.min(12, descriptionMatches * 4);

    if (locationSupports) {
      score += Math.min(10, locationMatches * 4);
    }

    // Ranking search result hanya bonus sangat kecil
    score += Math.max(0, 5 - index);

    const aliasOnlyInstagram = isInstagram && identityMatch.aliasMatched;
    const status = score >= 55 && (!aliasOnlyInstagram || contextSupported)
      ? 'MATCH'
      : 'REVIEW';

    candidates.push({
      url: normalizedUrl,
      status: status,
      score: score,
      contextSupported: contextSupported,
      source: rawUrl
    });

    seen[normalizedUrl] = true;
  });

  candidates.sort(function (a, b) {
    return b.score - a.score;
  });

  return candidates.length
    ? candidates[0]
    : {
        url: '',
        status: 'NOT_FOUND',
        score: 0,
        source: ''
      };
}

function extractSocialLinksFromWebsite_(websiteUrl, runId) {
  const page = fetchPageHtml_(websiteUrl, runId);
  if (!page.html) return { linkedin: '', instagram: '' };

  const hrefs = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  while (hrefs.length < 500) {
    const hrefMatch = regex.exec(page.html);
    if (hrefMatch === null) break;
    hrefs.push(decodeHtmlEntities_(hrefMatch[1]));
  }

  var linkedin = '';
  var instagram = '';
  hrefs.forEach(function (href) {
    if (!linkedin) linkedin = normalizeSocialProfileUrl_(href, 'LINKEDIN');
    if (!instagram) instagram = normalizeSocialProfileUrl_(href, 'INSTAGRAM');
  });

  return { linkedin: linkedin, instagram: instagram };
}

function fetchPageHtml_(url, runId) {
  if (!isSafePublicUrl_(url)) return { html: '', finalUrl: url };

  try {
    assertBatchRunActive_(runId);
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyEmailValidator/3.3.5)'
      },
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });

    assertBatchRunActive_(runId);
    const code = response.getResponseCode();
    if (code < 200 || code >= 400) return { html: '', finalUrl: url };
    return { html: truncate_(response.getContentText() || '', 500000), finalUrl: url };
  } catch (error) {
    if (isBatchStoppedError_(error)) throw error;
    return { html: '', finalUrl: url };
  }
}

function normalizeSocialProfileUrl_(url, platform) {
  const rawValue = cleanText_(url);
  if (!rawValue) return '';

  const valueWithScheme = rawValue.indexOf('//') === 0 ? 'https:' + rawValue : rawValue;
  if (!/^https?:\/\//i.test(valueWithScheme)) return '';

  const normalizedValue = valueWithScheme.split('#')[0].split('?')[0];
  const domain = getDomain_(normalizedValue);
  const lowerPlatform = String(platform || '').toUpperCase();

  if (lowerPlatform === 'LINKEDIN') {
    if (!(domain === 'linkedin.com' || endsWithText_(domain, '.linkedin.com'))) return '';
    const linkedinMatch = normalizedValue.match(/linkedin\.com\/(company|school)\/([^\/?#]+)/i);
    if (!linkedinMatch) return '';
    const profileType = cleanText_(linkedinMatch[1]).toLowerCase();
    const slug = cleanText_(linkedinMatch[2]).replace(/^@/, '').replace(/\/+$/, '');
    return slug ? 'https://www.linkedin.com/' + profileType + '/' + slug : '';
  }

  if (lowerPlatform === 'INSTAGRAM') {
    if (!(domain === 'instagram.com' || endsWithText_(domain, '.instagram.com'))) return '';
    const instagramMatch = normalizedValue.match(/instagram\.com\/([^\/?#]+)/i);
    if (!instagramMatch) return '';
    const username = cleanText_(instagramMatch[1]).replace(/^@/, '').replace(/\/+$/, '');
    if (!username || /^(p|reel|reels|stories|explore|accounts|direct|about|developer)$/i.test(username)) {
      return '';
    }
    return 'https://www.instagram.com/' + username + '/';
  }

  return '';
}

function getSocialSlug_(url, platform) {
  const value = cleanText_(url);
  if (String(platform).toUpperCase() === 'LINKEDIN') {
    const match = value.match(/linkedin\.com\/(?:company|school)\/([^\/?#]+)/i);
    return match ? match[1] : '';
  }
  if (String(platform).toUpperCase() === 'INSTAGRAM') {
    const match = value.match(/instagram\.com\/([^\/?#]+)/i);
    return match ? match[1] : '';
  }
  return '';
}

function sameSocialProfile_(urlA, urlB, platform) {
  const a = normalizeSocialProfileUrl_(urlA, platform);
  const b = normalizeSocialProfileUrl_(urlB, platform);
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function sanitizeSearchPhrase_(value) {
  return cleanText_(value).replace(/["\\]/g, ' ');
}

function tokenizeLocation_(location) {
  const stopWords = { kota: true, kabu: true, kabupaten: true, province: true, provinsi: true };
  return unique_(normalizeText_(location).split(/\s+/).filter(function (token) {
    return token.length >= 3 && !stopWords[token];
  }));
}

function countTokenMatches_(tokens, haystack) {
  return tokens.filter(function (token) {
    return haystack.indexOf(token) !== -1;
  }).length;
}

function requiredCompanyTokenMatches_(tokens) {
  if (!tokens.length) return 0;
  if (tokens.length === 1) return 1;
  return Math.min(2, tokens.length);
}

function findEmailEvidence_(results, companyName, email, presence, runId) {
  const companyTokens = tokenizeCompanyName_(companyName);
  const channels = {
    website: { found: false, sourceUrl: '', score: -999 },
    linkedin: { found: false, sourceUrl: '', score: -999 },
    instagram: { found: false, sourceUrl: '', score: -999 },
    other: { found: false, sourceUrl: '', score: -999 }
  };
  var best = {
    exactFound: false,
    companyMatched: false,
    otherCompanySuspected: false,
    type: '',
    sourceUrl: '',
    score: -999,
    channels: channels
  };

  const limitedResults = (results || []).slice(0, EMAIL_VALIDATOR_CONFIG.MAX_PAGES_TO_INSPECT);
  for (var i = 0; i < limitedResults.length; i++) {
    assertBatchRunActive_(runId);
    const item = limitedResults[i];
    const url = cleanText_(item.url);
    if (!url) continue;

    const domain = getDomain_(url);
    const snippetText = [
      item.title || '',
      item.description || '',
      Array.isArray(item.extra_snippets) ? item.extra_snippets.join(' ') : ''
    ].join(' ');

    const page = fetchPageText_(url, runId);
    const combined = normalizeEvidenceText_(snippetText + ' ' + (page.text || ''));
    const exactFound = containsEmail_(combined, email.toLowerCase());
    const tokenMatches = countTokenMatches_(companyTokens, combined);
    const companyMatched = tokenMatches >= requiredCompanyTokenMatches_(companyTokens);

    var type = 'OTHER_PUBLIC_SOURCE';
    var channel = 'other';
    if (presence.website.domain && sameRegistrableDomain_(domain, presence.website.domain)) {
      type = 'OFFICIAL_WEBSITE';
      channel = 'website';
    } else if (sameSocialProfile_(url, presence.linkedin.url, 'LINKEDIN') || /(^|\.)linkedin\.com$/.test(domain)) {
      type = companyMatched ? 'OFFICIAL_LINKEDIN' : 'LINKEDIN_SOURCE';
      channel = 'linkedin';
    } else if (sameSocialProfile_(url, presence.instagram.url, 'INSTAGRAM') || /(^|\.)instagram\.com$/.test(domain)) {
      type = companyMatched ? 'OFFICIAL_INSTAGRAM' : 'INSTAGRAM_SOURCE';
      channel = 'instagram';
    } else if (/facebook\.com|tiktok\.com/.test(domain) && companyMatched) {
      type = 'OTHER_OFFICIAL_SOCIAL';
    } else if (/jobstreet|glints|kalibrr|indeed|dealls|loker|kitalulus|karir|jobs\./.test(domain)) {
      type = 'THIRD_PARTY_JOB_POST';
    }

    var score = 0;
    if (exactFound) score += 50;
    if (companyMatched) score += 30;
    if (type === 'OFFICIAL_WEBSITE') score += 25;
    if (type === 'OFFICIAL_LINKEDIN' || type === 'OFFICIAL_INSTAGRAM') score += 20;
    if (type === 'OTHER_OFFICIAL_SOCIAL') score += 15;
    if (type === 'THIRD_PARTY_JOB_POST') score += 8;

    const otherCompanySuspected = exactFound && !companyMatched && companyTokens.length > 0;
    if (otherCompanySuspected) score -= 20;

    if (exactFound && score > channels[channel].score) {
      channels[channel] = { found: true, sourceUrl: page.finalUrl || url, score: score };
    }

    if (score > best.score) {
      best = {
        exactFound: exactFound,
        companyMatched: companyMatched,
        otherCompanySuspected: otherCompanySuspected,
        type: type,
        sourceUrl: page.finalUrl || url,
        score: score,
        channels: channels
      };
    }

    // Early stop: bukti exact + perusahaan cocok + kanal resmi sudah cukup kuat.
    if (exactFound && companyMatched &&
        (type === 'OFFICIAL_WEBSITE' || type === 'OFFICIAL_LINKEDIN' ||
         type === 'OFFICIAL_INSTAGRAM' || type === 'OTHER_OFFICIAL_SOCIAL')) {
      break;
    }
  }

  best.exactFound = channels.website.found || channels.linkedin.found ||
    channels.instagram.found || channels.other.found;
  best.channels = channels;
  return best;
}

function fetchPageText_(url, runId) {
  if (!isSafePublicUrl_(url)) return { text: '', finalUrl: url };

  try {
    assertBatchRunActive_(runId);
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyEmailValidator/3.3.5)'
      },
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });

    assertBatchRunActive_(runId);
    const code = response.getResponseCode();
    if (code < 200 || code >= 400) return { text: '', finalUrl: url };

    const raw = response.getContentText() || '';
    const text = decodeHtmlEntities_(raw)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    return { text: truncate_(text, 250000), finalUrl: url };
  } catch (error) {
    if (isBatchStoppedError_(error)) throw error;
    return { text: '', finalUrl: url };
  }
}

function containsEmail_(text, email) {
  if (!text || !email) return false;
  const normalized = String(text).toLowerCase();
  if (normalized.indexOf(email) !== -1) return true;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const local = escapeRegExp_(parts[0]);
  const domainParts = parts[1].split('.').map(escapeRegExp_);
  const domainPattern = domainParts.join('(?:\\s*(?:\\.|\\[dot\\]|\\(dot\\)|dot)\\s*)');
  const pattern = new RegExp(
    local + '(?:\\s*(?:@|\\[at\\]|\\(at\\)|at)\\s*)' + domainPattern,
    'i'
  );
  return pattern.test(normalized);
}


function assertValidatorApiKey_() {
  const key = cleanText_(PropertiesService.getScriptProperties().getProperty(
    EMAIL_VALIDATOR_CONFIG.API_KEY_PROPERTY
  ));
  if (!key) {
    throw new Error('OpenAI API key belum disimpan. Gunakan menu Email Validator → Simpan OpenAI API Key.');
  }
  return key;
}

function getHeaderMap_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet
    .getRange(EMAIL_VALIDATOR_CONFIG.HEADER_ROW, 1, 1, lastColumn)
    .getDisplayValues()[0];
  const map = {};

  headers.forEach(function (header, index) {
    const cleaned = cleanText_(header);
    if (cleaned) map[cleaned] = index + 1;
  });
  return map;
}

function requireHeader_(headerMap, header) {
  if (!headerMap[header]) throw new Error('Header wajib "' + header + '" tidak ditemukan.');
  return headerMap[header];
}

function buildLocationText_(rowValues, headerMap) {
  const possibleHeaders = ['Province', 'City', 'District', 'Work Location'];
  return unique_(possibleHeaders.map(function (header) {
    const col = headerMap[header];
    return col ? cleanText_(rowValues[col - 1]) : '';
  }).filter(Boolean)).join(' ');
}

function normalizeEmail_(value) {
  const text = cleanText_(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/i);
  return match ? match[0].replace(/[),.;:'"<>]+$/g, '') : text;
}

function isValidEmailFormat_(email) {
  if (!email || email.length > 254) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(email);
}

function isFreeEmailDomain_(domain) {
  return FREE_EMAIL_DOMAINS_.indexOf(String(domain || '').toLowerCase()) !== -1;
}

function normalizeCompanyKey_(companyName) {
  return normalizeText_(companyName)
    .replace(/\b(pt|cv|tbk|ltd|inc|corp|corporation|company|group|indonesia)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeCompanyName_(companyName) {
  const stopWords = {
    pt: true, cv: true, tbk: true, ltd: true, inc: true, corp: true,
    corporation: true, company: true, group: true, indonesia: true,
    the: true, and: true, dan: true, resto: true, restaurant: true
  };

  return unique_(normalizeText_(companyName)
    .split(/\s+/)
    .filter(function (token) { return token.length >= 3 && !stopWords[token]; }));
}

function normalizeEvidenceText_(text) {
  return decodeHtmlEntities_(String(text || ''))
    .toLowerCase()
    .replace(/\s*(?:\[at\]|\(at\))\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s+/g, ' ');
}

function normalizeText_(value) {
  return cleanText_(value)
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsNormalizedPhrase_(text, phrase) {
  const haystack = normalizeText_(text);
  const needle = normalizeText_(phrase);
  if (!haystack || !needle) return false;
  return (' ' + haystack + ' ').indexOf(' ' + needle + ' ') !== -1;
}

function cleanText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function getOrigin_(url) {
  const match = String(url || '').match(/^(https?:\/\/[^\/]+)/i);
  return match ? match[1] : '';
}

function getDomain_(urlOrDomain) {
  var value = cleanText_(urlOrDomain).toLowerCase();
  value = value.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  return value.replace(/^www\./, '').replace(/\.$/, '');
}

function getDomainStem_(domain) {
  const value = getDomain_(domain);
  if (!value) return '';
  const labels = value.split('.');
  if (labels.length < 2) return labels[0];
  const publicSecondLevel = ['co', 'ac', 'or', 'go', 'sch', 'net', 'web'];
  if (labels.length >= 3 && labels[labels.length - 1] === 'id' &&
      publicSecondLevel.indexOf(labels[labels.length - 2]) !== -1) {
    return labels[labels.length - 3];
  }
  return labels[labels.length - 2];
}

function getRegistrableDomain_(domain) {
  const value = getDomain_(domain);
  if (!value) return '';
  const labels = value.split('.').filter(Boolean);
  if (labels.length < 2) return value;
  const publicSecondLevel = ['co', 'ac', 'or', 'go', 'sch', 'net', 'web'];
  if (labels.length >= 3 && labels[labels.length - 1] === 'id' &&
      publicSecondLevel.indexOf(labels[labels.length - 2]) !== -1) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

function isSubdomainOf_(domain, rootDomain) {
  const child = getDomain_(domain);
  const root = getDomain_(rootDomain);
  return Boolean(child && root && (child === root || endsWithText_(child, '.' + root)));
}

function isCampaignOrUtilitySubdomain_(domain) {
  const value = getDomain_(domain);
  const root = getRegistrableDomain_(value);
  if (!value || !root || value === root) return false;
  const firstLabel = value.slice(0, -(root.length + 1));
  return /(^|\.)(penmaru|pmb|spmb|admisi|admission|admissions|registrasi|penerimaan|ppmb|career|careers|job|jobs|rekrutmen|portal|info|mail|news|media|blog|shop|marketplace)(\.|$)/i.test(firstLabel);
}

function domainStemMatches_(domain, stem) {
  const domainValue = getDomain_(domain);
  const expected = cleanText_(stem).toLowerCase().replace(/[^a-z0-9]/g, '');
  const actual = cleanText_(getDomainStem_(domainValue)).toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(expected && actual && expected === actual);
}

function endsWithText_(value, suffix) {
  const text = String(value || '');
  const ending = String(suffix || '');
  if (!ending) return true;
  if (ending.length > text.length) return false;
  return text.slice(text.length - ending.length) === ending;
}

function sameRegistrableDomain_(domainA, domainB) {
  const a = getRegistrableDomain_(domainA);
  const b = getRegistrableDomain_(domainB);
  if (!a || !b) return false;
  return a === b;
}

function isBlockedOfficialDomain_(domain) {
  const value = getDomain_(domain);
  return BLOCKED_OFFICIAL_DOMAINS_.some(function (blocked) {
    return value === blocked || endsWithText_(value, '.' + blocked);
  });
}

function isBlockedOfficialUrl_(url) {
  const value = cleanText_(url);
  if (!value || isBlockedOfficialDomain_(getDomain_(value))) return true;
  const path = value.replace(/^https?:\/\/[^/]+/i, '').toLowerCase();
  return /\/(?:job|jobs|career|careers|lowongan|loker|media|news|blog|directory|direktori|marketplace|shop|store|listing|company|profile)(?:[/?#]|$)/i.test(path);
}

function isSafePublicUrl_(url) {
  const value = cleanText_(url);
  if (!/^https?:\/\//i.test(value)) return false;
  const domain = getDomain_(value);
  if (!domain || domain === 'localhost' || /^127\./.test(domain)) return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(domain)) return false;
  return true;
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#64;/gi, '@')
    .replace(/&#46;/gi, '.');
}

function unique_(items) {
  const seen = {};
  return items.filter(function (item) {
    const key = String(item);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function appendNote_(current, extra) {
  const a = cleanText_(current);
  const b = cleanText_(extra);
  if (!a) return b;
  if (!b || a.indexOf(b) !== -1) return a;
  return a + ' ' + b;
}

function escapeRegExp_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate_(text, maxLength) {
  const value = String(text || '');
  return value.length <= maxLength ? value : value.slice(0, maxLength) + '…';
}

function getErrorMessage_(error) {
  if (!error) return 'Unknown error';
  return cleanText_(error.message || error.toString());
}
