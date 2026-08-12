/**
 * N8N HARDENING LAYER
 *
 * Dipasang saat eksekusi n8n untuk memperketat resolver identity tanpa
 * mengubah alur manual Apps Script yang sudah stabil.
 *
 * Fokus:
 * 1) social profile wajib cocok pada slug/profile identity, bukan substring pendek;
 * 2) LinkedIn job/post tidak boleh dianggap official LinkedIn company profile;
 * 3) cache lama yang menyimpan website/social/legal false-positive dianggap stale;
 * 4) legal/AHU DIRECT/PARENT wajib punya legal name + evidence yang benar;
 * 5) row dengan cache suspicious diproses ulang walau validatorVersion masih 3.3.6.
 */

var N8N_HARDENING_APPLIED_ = false;
var N8N_ORIGINAL_IS_USABLE_EMAIL_CACHE_ = null;
var N8N_ORIGINAL_IS_USABLE_COMPANY_CACHE_ = null;
var N8N_ORIGINAL_INFER_LEGAL_ENTITY_PRESENCE_ = null;

function applyValidatorHardeningN8n_() {
  if (N8N_HARDENING_APPLIED_) return;

  N8N_ORIGINAL_IS_USABLE_EMAIL_CACHE_ = isUsableEmailCache_;
  N8N_ORIGINAL_IS_USABLE_COMPANY_CACHE_ = isUsableCompanyCache_;
  N8N_ORIGINAL_INFER_LEGAL_ENTITY_PRESENCE_ = inferLegalEntityPresence_;

  // Runtime override hanya berlaku pada execution n8n yang memanggil fungsi ini.
  isSocialProfileIdentityCompatible_ = isSocialProfileIdentityCompatibleN8nHard_;
  inferSocialProfile_ = inferSocialProfileN8nHard_;
  findEmailEvidence_ = findEmailEvidenceN8nHard_;
  shouldProcessValidationRowN8n_ = shouldProcessValidationRowN8nHard_;

  isUsableEmailCache_ = function (cached) {
    if (!N8N_ORIGINAL_IS_USABLE_EMAIL_CACHE_(cached)) return false;
    return !isSuspiciousEmailCacheN8nHard_(cached);
  };

  isUsableCompanyCache_ = function (item) {
    if (!N8N_ORIGINAL_IS_USABLE_COMPANY_CACHE_(item)) return false;
    return !isSuspiciousCompanyCacheN8nHard_(item);
  };

  inferLegalEntityPresence_ = function (results, companyName, location, entityType, officialDomain) {
    const legal = N8N_ORIGINAL_INFER_LEGAL_ENTITY_PRESENCE_(
      results, companyName, location, entityType, officialDomain
    );
    return sanitizeLegalPresenceN8nHard_(legal, companyName, officialDomain);
  };

  N8N_HARDENING_APPLIED_ = true;
}

function shouldProcessValidationRowN8nHard_(sourceRow, rowValues, headerMap, rawIndex, mode) {
  const company = cleanText_(rowValues[headerMap['Company Name'] - 1]);
  const type = cleanText_(rowValues[headerMap['Contact Type'] - 1]).toUpperCase();
  const email = normalizeEmail_(rowValues[headerMap['Contact'] - 1]);
  if (!company || type !== 'EMAIL' || !email) return false;

  const existingRow = rawIndex.rowsBySourceRow[String(sourceRow)];

  // False-positive lama pada row yang sama harus diperbaiki, bukan dilewati
  // hanya karena versinya kebetulan sudah 3.3.6.
  if (existingRow && isSuspiciousEmailCacheN8nHard_(existingRow, company)) return true;

  if (mode === 'RETRY') {
    if (!existingRow) return true;
    const status = cleanText_(existingRow.status).toUpperCase();
    return /NOT_PUBLICLY_VERIFIED|REVIEW_REQUIRED|MISMATCH_SUSPECTED|INVALID|ERROR/.test(status);
  }

  // Jika row yang sama sudah final dan sehat, tidak perlu disentuh lagi.
  if (existingRow && isCompatibleValidatorVersion_(existingRow.validatorVersion)) {
    const status = cleanText_(existingRow.status).toUpperCase();
    if (status && status !== 'PROCESSING' && status !== 'ERROR') return false;
  }

  // Company+email yang sama di row lain memakai cache penuh dan tidak perlu
  // masuk request Web Search lagi.
  const validationKey = makeValidationKey_(company, email);
  const cached = rawIndex.byValidationKey[validationKey];
  if (cached && isUsableEmailCache_(cached)) return false;

  return true;
}

function isSuspiciousEmailCacheN8nHard_(cached, companyName) {
  if (!cached) return false;
  const company = cleanText_(companyName || cached.companyName);

  if (cached.officialWebsite && !isStrictOfficialWebsiteForCompany_(cached.officialWebsite, company)) {
    return true;
  }
  if (cached.linkedinUrl && !isSocialProfileIdentityCompatibleN8nHard_(cached.linkedinUrl, company, 'LINKEDIN')) {
    return true;
  }
  if (cached.instagramUrl && !isSocialProfileIdentityCompatibleN8nHard_(cached.instagramUrl, company, 'INSTAGRAM')) {
    return true;
  }

  const evidenceType = cleanText_(cached.evidenceType).toUpperCase();
  if (evidenceType === 'OFFICIAL_LINKEDIN' &&
      !sameSocialProfile_(cached.evidenceSource, cached.linkedinUrl, 'LINKEDIN')) {
    return true;
  }
  if (evidenceType === 'OFFICIAL_INSTAGRAM' &&
      !sameSocialProfile_(cached.evidenceSource, cached.instagramUrl, 'INSTAGRAM')) {
    return true;
  }

  const ahuStatus = cleanText_(cached.ahuStatus).toUpperCase();
  if ((!ahuStatus || ahuStatus === 'NOT_FOUND' || ahuStatus === 'NOT_APPLICABLE') &&
      (Number(cached.legalConfidence || 0) > 0 || cleanText_(cached.legalEntityName) ||
       cleanText_(cached.ahuRegisteredName) || cleanText_(cached.legalRelationship))) {
    return true;
  }

  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahuStatus)) {
    if (!isValidLegalEntityName_(
      cached.legalEntityName || cached.ahuRegisteredName,
      company,
      getAhuParentEntities_(company)
    )) return true;

    const legalSource = cleanText_(cached.legalEvidenceSource || cached.ahuEvidence);
    if (!legalSource ||
        (!isLegalEvidenceSourceUrl_(legalSource, company, cached.officialDomain) &&
         !isOfficialAhuEvidenceUrl_(legalSource))) return true;
  }

  return false;
}

function isSuspiciousCompanyCacheN8nHard_(item) {
  if (!item) return false;
  const company = cleanText_(item.companyName);

  if (item.website && !isStrictOfficialWebsiteForCompany_(item.website, company)) return true;
  if (item.linkedin && !isSocialProfileIdentityCompatibleN8nHard_(item.linkedin, company, 'LINKEDIN')) return true;
  if (item.instagram && !isSocialProfileIdentityCompatibleN8nHard_(item.instagram, company, 'INSTAGRAM')) return true;

  const ahuStatus = cleanText_(item.ahuStatus).toUpperCase();
  if ((!ahuStatus || ahuStatus === 'NOT_FOUND' || ahuStatus === 'NOT_APPLICABLE') &&
      (Number(item.legalConfidence || 0) > 0 || cleanText_(item.legalEntityName) ||
       cleanText_(item.ahuRegisteredName) || cleanText_(item.legalRelationship))) {
    return true;
  }

  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(ahuStatus)) {
    if (!isValidLegalEntityName_(
      item.legalEntityName || item.ahuRegisteredName,
      company,
      getAhuParentEntities_(company)
    )) return true;

    const legalSource = cleanText_(item.legalEvidenceSource || item.ahuEvidence);
    if (!legalSource ||
        (!isLegalEvidenceSourceUrl_(legalSource, company, item.domain) &&
         !isOfficialAhuEvidenceUrl_(legalSource))) return true;
  }

  return false;
}

function isSocialProfileIdentityCompatibleN8nHard_(url, companyName, platform) {
  const rawSlug = cleanText_(getSocialSlug_(url, platform)).toLowerCase();
  if (!rawSlug) return false;

  const identity = buildCompanyIdentity_(companyName);
  const slugCompact = normalizeText_(rawSlug).replace(/\s+/g, '');
  const slugWords = normalizeText_(rawSlug.replace(/[._-]+/g, ' ')).split(/\s+/).filter(Boolean);
  const slugWordSet = {};
  slugWords.forEach(function (word) { slugWordSet[word] = true; });

  // Paling kuat: nama/alias perusahaan benar-benar sama dengan slug, atau slug
  // hanya menambahkan suffix bisnis umum. Ini menangani dwjstudio, ummetro, dll.
  const allowedSuffix = /^(?:id|indo|indonesia|official|offical|group|grup|company|co|corp|studio|store|shop|school|academy)$/;
  const exactAlias = identity.nameKeys.some(function (candidate) {
    const key = normalizeText_(candidate).replace(/\s+/g, '');
    if (!key) return false;
    if (slugCompact === key) return true;
    if (slugCompact.indexOf(key) !== 0) return false;
    return allowedSuffix.test(slugCompact.slice(key.length));
  });
  if (exactAlias) return true;

  const companyTokens = identity.fullNameTokens.filter(function (token) {
    return token.length >= 3;
  });
  if (!companyTokens.length) return false;

  // Token slug yang dipisah '-' '_' '.' harus exact, bukan substring.
  const exactTokenMatches = companyTokens.filter(function (token) {
    return Boolean(slugWordSet[token]);
  });
  if (exactTokenMatches.length >= Math.min(2, companyTokens.length)) return true;

  // Untuk slug padat tanpa separator, token pendek (<=3) sengaja tidak dihitung
  // sebagai substring. Ini mencegah DIA cocok dengan DIALOOG.
  const compactMatches = companyTokens.filter(function (token) {
    return token.length >= 4 && slugCompact.indexOf(token) !== -1;
  });
  if (compactMatches.length >= Math.min(2, companyTokens.filter(function (t) { return t.length >= 4; }).length || 2)) {
    return compactMatches.length >= 2;
  }

  return false;
}

function inferSocialProfileN8nHard_(results, companyName, location, platform) {
  const identity = buildCompanyIdentity_(companyName);
  const locationTokens = tokenizeLocation_(location);
  const isInstagram = String(platform).toUpperCase() === 'INSTAGRAM';
  const candidates = [];
  const seen = {};

  (results || []).forEach(function (item, index) {
    const rawUrl = cleanText_(item && item.url);
    const normalizedUrl = normalizeSocialProfileUrl_(rawUrl, platform);
    if (!normalizedUrl || seen[normalizedUrl]) return;
    seen[normalizedUrl] = true;

    if (isInstagram && isInstagramVendorProfileForOtherCompany_(normalizedUrl, companyName)) return;

    const requestedEntityType = resolveEntityType_(companyName, '', location);
    const linkedinProfileType = String(platform).toUpperCase() === 'LINKEDIN'
      ? ((normalizedUrl.match(/linkedin\.com\/(company|school)\//i) || [])[1] || '').toLowerCase()
      : '';
    if (linkedinProfileType === 'school' && !isEducationalEntityType_(requestedEntityType)) return;

    // HARD GATE: slug/profile URL sendiri harus cocok dengan identitas perusahaan.
    // Judul search result tidak boleh menyulap profile lain menjadi MATCH.
    if (!isSocialProfileIdentityCompatibleN8nHard_(normalizedUrl, companyName, platform)) return;

    const title = normalizeText_(item && item.title || '');
    const description = normalizeText_(item && item.description || '');
    const slug = normalizeText_(getSocialSlug_(normalizedUrl, platform));
    const supportText = normalizeText_([title, description].join(' '));
    const identityMatch = getCompanyIdentityMatch_(identity, [title, slug].join(' '), '');

    const fullNameSupported = containsNormalizedPhrase_(supportText, identity.canonicalKey) ||
      hardCompanyTextMatchN8n_(supportText, companyName);
    const locationMatches = countExactNormalizedTokensN8n_(locationTokens, supportText);

    var score = 50; // lolos hard slug gate sudah merupakan bukti identity utama.
    if (containsNormalizedPhrase_(title, identity.canonicalKey)) score += 25;
    if (fullNameSupported) score += 15;
    if (locationMatches) score += Math.min(8, locationMatches * 3);
    if (identityMatch.aliasMatched) score += 5;
    score += Math.max(0, 4 - index);

    candidates.push({
      url: normalizedUrl,
      status: score >= 60 ? 'MATCH' : 'REVIEW',
      score: Math.min(100, score),
      source: cleanText_(item && item.evidenceSource) || rawUrl
    });
  });

  candidates.sort(function (a, b) { return b.score - a.score; });
  return candidates.length ? candidates[0] : {
    url: '', status: 'NOT_FOUND', score: 0, source: ''
  };
}

function findEmailEvidenceN8nHard_(results, companyName, email, presence, runId) {
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
    const item = limitedResults[i] || {};
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
    const companyMatched = hardCompanyTextMatchN8n_(combined, companyName);

    const sameWebsite = Boolean(
      presence && presence.website && presence.website.domain &&
      sameRegistrableDomain_(domain, presence.website.domain)
    );
    const sameLinkedIn = Boolean(
      presence && presence.linkedin && presence.linkedin.url &&
      sameSocialProfile_(url, presence.linkedin.url, 'LINKEDIN')
    );
    const sameInstagram = Boolean(
      presence && presence.instagram && presence.instagram.url &&
      sameSocialProfile_(url, presence.instagram.url, 'INSTAGRAM')
    );
    const linkedinJobOrPost = /(^|\.)linkedin\.com$/.test(domain) &&
      /linkedin\.com\/(?:jobs\/view|posts|feed\/update|pulse)\//i.test(url);

    var type = 'OTHER_PUBLIC_SOURCE';
    var channel = 'other';

    if (sameWebsite) {
      type = 'OFFICIAL_WEBSITE';
      channel = 'website';
    } else if (sameLinkedIn) {
      type = companyMatched ? 'OFFICIAL_LINKEDIN' : 'LINKEDIN_SOURCE';
      channel = 'linkedin';
    } else if (sameInstagram) {
      type = companyMatched ? 'OFFICIAL_INSTAGRAM' : 'INSTAGRAM_SOURCE';
      channel = 'instagram';
    } else if (linkedinJobOrPost) {
      type = 'THIRD_PARTY_JOB_POST';
      channel = 'other';
    } else if (/(^|\.)linkedin\.com$/.test(domain)) {
      type = 'LINKEDIN_SOURCE';
      channel = 'other';
    } else if (/(^|\.)instagram\.com$/.test(domain)) {
      type = 'INSTAGRAM_SOURCE';
      channel = 'other';
    } else if (/facebook\.com|tiktok\.com/.test(domain)) {
      type = companyMatched ? 'OTHER_PUBLIC_SOURCE' : 'OTHER_PUBLIC_SOURCE';
      channel = 'other';
    } else if (/jobstreet|glints|kalibrr|indeed|dealls|loker|kitalulus|karir|jobs\./.test(domain)) {
      type = 'THIRD_PARTY_JOB_POST';
      channel = 'other';
    }

    var score = 0;
    if (exactFound) score += 50;
    if (companyMatched) score += 30;
    if (type === 'OFFICIAL_WEBSITE') score += 25;
    if (type === 'OFFICIAL_LINKEDIN' || type === 'OFFICIAL_INSTAGRAM') score += 20;
    if (type === 'THIRD_PARTY_JOB_POST') score += 8;

    const otherCompanySuspected = exactFound && !companyMatched;
    if (otherCompanySuspected) score -= 25;

    if (exactFound && score > channels[channel].score) {
      channels[channel] = {
        found: true,
        sourceUrl: page.finalUrl || url,
        score: score
      };
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

    if (exactFound && companyMatched &&
        (type === 'OFFICIAL_WEBSITE' || type === 'OFFICIAL_LINKEDIN' || type === 'OFFICIAL_INSTAGRAM')) {
      break;
    }
  }

  best.exactFound = channels.website.found || channels.linkedin.found ||
    channels.instagram.found || channels.other.found;
  best.channels = channels;
  return best;
}

function hardCompanyTextMatchN8n_(text, companyName) {
  const normalized = normalizeText_(text);
  if (!normalized) return false;

  const identity = buildCompanyIdentity_(companyName);
  if (containsNormalizedPhrase_(normalized, identity.canonicalKey)) return true;

  // Alias panjang (>= 5 karakter compact) boleh menjadi exact phrase support.
  const aliasPhrase = identity.nameKeys.some(function (alias) {
    const compact = alias.replace(/\s+/g, '');
    return compact.length >= 5 && containsNormalizedPhrase_(normalized, alias);
  });
  if (aliasPhrase) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  const wordSet = {};
  words.forEach(function (word) { wordSet[word] = true; });

  const tokens = identity.fullNameTokens.filter(function (token) { return token.length >= 3; });
  const matches = tokens.filter(function (token) { return Boolean(wordSet[token]); });
  const required = requiredCompanyTokenMatches_(tokens);
  return required > 0 && matches.length >= required;
}

function countExactNormalizedTokensN8n_(tokens, text) {
  const wordSet = {};
  normalizeText_(text).split(/\s+/).filter(Boolean).forEach(function (word) {
    wordSet[word] = true;
  });
  return (tokens || []).filter(function (token) {
    return Boolean(wordSet[normalizeText_(token)]);
  }).length;
}

function sanitizeLegalPresenceN8nHard_(legal, companyName, officialDomain) {
  if (!legal) return emptyLegalPresence_('NOT_FOUND');

  const status = cleanText_(legal.status).toUpperCase();
  if (status === 'NOT_APPLICABLE') return legal;

  const source = cleanText_(legal.legalEvidenceSource || legal.source || legal.evidenceUrl);
  const legalName = cleanText_(legal.legalEntityName || legal.registeredName);
  const validName = isValidLegalEntityName_(
    legalName,
    companyName,
    getAhuParentEntities_(companyName)
  );
  const validSource = Boolean(source) && (
    isLegalEvidenceSourceUrl_(source, companyName, officialDomain) ||
    isOfficialAhuEvidenceUrl_(source)
  );

  if (/^(DIRECT_MATCH|PARENT_ENTITY_MATCH)$/.test(status) && (!validName || !validSource)) {
    const downgraded = emptyLegalPresence_('REVIEW');
    downgraded.source = validSource ? source : '';
    downgraded.legalEvidenceSource = validSource ? source : '';
    downgraded.legalEntityName = validName ? legalName : '';
    downgraded.registeredName = validName ? cleanText_(legal.registeredName) : '';
    downgraded.legalConfidence = validName && validSource ? 50 : 0;
    downgraded.score = downgraded.legalConfidence;
    return downgraded;
  }

  if (status === 'NOT_FOUND') {
    return emptyLegalPresence_('NOT_FOUND');
  }

  if (status === 'REVIEW' || status === 'MANUAL_AHU_CHECK') {
    legal.legalConfidence = Math.min(50, Number(legal.legalConfidence || 0));
    legal.score = Math.min(50, Number(legal.score || 0));
  }
  return legal;
}
