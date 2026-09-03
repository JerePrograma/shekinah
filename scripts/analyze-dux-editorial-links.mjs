import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRICE_LIST = 'PRECIOS DEL NEGOCIO';
const FUZZY_REVIEW_SCORE = 0.75;
const FUZZY_MARGIN = 0.08;
const PRESENTATION_QUANTITY_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}])/giu;
const PRESENTATION_SEPARATOR_PATTERN =
  /(^|\s)[x×](?=\s*\d+(?:[.,]\d+)?\s*(?:kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}]))/giu;
const CANONICAL_PRESENTATION_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:\.\d+)?)\s(g|ml)(?![\p{L}\p{N}])/gu;
const SEMANTIC_NOISE_PATTERN = /\b(?:x|por|unidad|unidades|marca|shekinah)\b/gu;

export function buildDuxEditorialLinkAnalysis(source, baseReport) {
  validateInputs(source, baseReport);

  const localDescriptors = source.localProducts.map(localDescriptor);
  const localById = new Map(
    localDescriptors.map((descriptor) => [descriptor.product.id, descriptor]),
  );
  const localBySemanticName = groupByKey(
    localDescriptors,
    (descriptor) => descriptor.semanticNameKey,
  );
  const localBySemanticTokens = groupByKey(
    localDescriptors,
    (descriptor) => descriptor.semanticTokenKey,
  );
  const baseByCode = new Map(
    baseReport.matches.map((match) => [match.dux.code, match]),
  );
  const quantifiedCodes = new Set(
    source.inventoryUnits
      .filter((unit) => unit.lastSyncStatus !== 'absent')
      .map((unit) => unit.itemCode),
  );

  const proposals = source.duxItems.map((item) => buildProposal(
    item,
    baseByCode.get(item.code),
    localById,
    localBySemanticName,
    localBySemanticTokens,
    quantifiedCodes,
  ));
  downgradeSharedFullLinks(proposals);

  const duplicateSemanticGroups = buildDuplicateSemanticGroups(localDescriptors);
  const localPresentationConflicts = localDescriptors
    .filter((descriptor) => descriptor.presentationIntegrity === 'conflict')
    .map((descriptor) => localCandidateSummary(descriptor, null, 'local_integrity'));
  const qualityItems = proposals.filter((proposal) =>
    proposal.dux.priceQuality !== 'usable' || !proposal.dux.quantified);

  return Object.freeze({
    generatedAt: source.generatedAt,
    readOnly: true,
    policy: Object.freeze({
      authority: Object.freeze({
        existence: 'dux',
        name: 'dux',
        price: 'dux',
        stock: 'dux',
      }),
      local: 'editorial_enrichment_only',
      mercadoLibre: 'not_available_in_d1',
      writesPerformed: false,
      automaticFields: Object.freeze(['images', 'description']),
      neverCopiedFromLocal: Object.freeze(['name', 'price', 'stock', 'sku']),
    }),
    thresholds: Object.freeze({
      fuzzyReviewScore: FUZZY_REVIEW_SCORE,
      fuzzyMargin: FUZZY_MARGIN,
      placeholderPrices: Object.freeze([1, 2]),
    }),
    sources: Object.freeze({
      duxItems: source.duxItems.length,
      localProducts: source.localProducts.length,
      inventoryUnits: source.inventoryUnits.length,
      mercadoLibreUnits: source.mercadoLibre.units.length,
    }),
    quality: Object.freeze({
      usablePublicPrice: proposals.filter((proposal) =>
        proposal.dux.priceQuality === 'usable').length,
      placeholderPublicPrice: proposals.filter((proposal) =>
        proposal.dux.priceQuality === 'placeholder').length,
      missingOrZeroPublicPrice: proposals.filter((proposal) =>
        proposal.dux.priceQuality === 'missing_or_zero').length,
      quantified: proposals.filter((proposal) => proposal.dux.quantified).length,
      unquantified: proposals.filter((proposal) => !proposal.dux.quantified).length,
      cutoverPriceBlockers: proposals.filter((proposal) =>
        proposal.dux.priceQuality !== 'usable').length,
    }),
    summary: Object.freeze({
      confirmedIdentity: countStatus(proposals, 'confirmed_identity'),
      autoFull: countStatus(proposals, 'auto_full'),
      totalAutoConfirmable:
        countStatus(proposals, 'confirmed_identity') + countStatus(proposals, 'auto_full'),
      reviewFull: countStatus(proposals, 'review_full'),
      reviewImage: countStatus(proposals, 'review_image'),
      reviewFuzzy: countStatus(proposals, 'review_fuzzy'),
      ambiguous: countStatus(proposals, 'ambiguous'),
      noCandidate: countStatus(proposals, 'no_candidate'),
      reusableImageAutomatically: proposals.filter((proposal) =>
        isAutoStatus(proposal.status) && proposal.recommendedFields.includes('images')).length,
      reusableDescriptionAutomatically: proposals.filter((proposal) =>
        isAutoStatus(proposal.status) && proposal.recommendedFields.includes('description')).length,
      duplicateSemanticLocalGroups: duplicateSemanticGroups.length,
      localPresentationConflicts: localPresentationConflicts.length,
    }),
    proposals: Object.freeze(proposals),
    qualityItems: Object.freeze(qualityItems),
    duplicateSemanticGroups,
    localPresentationConflicts: Object.freeze(localPresentationConflicts),
  });
}

function buildProposal(
  item,
  baseMatch,
  localById,
  localBySemanticName,
  localBySemanticTokens,
  quantifiedCodes,
) {
  if (baseMatch === undefined) {
    throw new Error(`El informe base no contiene el código Dux ${item.code}.`);
  }
  const dux = duxSummary(item, quantifiedCodes.has(item.code));

  if (baseMatch.local.status === 'confirmed') {
    const descriptor = localById.get(baseMatch.local.selectedId);
    if (descriptor === undefined) {
      throw new Error(`El mapping confirmado de ${item.code} no existe localmente.`);
    }
    const candidate = analyzeCandidate(item, descriptor, 1, 'persisted_inventory_mapping');
    return proposal(
      dux,
      'confirmed_identity',
      'persisted_inventory_mapping',
      descriptor.product.id,
      candidate.presentationRelation,
      recommendedFields(candidate, true),
      [candidate],
      [],
    );
  }

  if (baseMatch.local.status === 'ambiguous') {
    const candidates = baseMatch.local.candidates
      .map((candidate) => {
        const descriptor = localById.get(candidate.id);
        return descriptor === undefined
          ? null
          : analyzeCandidate(
              item,
              descriptor,
              candidate.score,
              candidate.reasons.join('+'),
            );
      })
      .filter((candidate) => candidate !== null);
    return proposal(
      dux,
      'ambiguous',
      'persisted_or_shared_conflict',
      null,
      null,
      [],
      candidates,
      ['manual_resolution_required'],
    );
  }

  let descriptors = localBySemanticName.get(semanticNameKey(item.name)) ?? [];
  let method = 'exact_semantic_name';
  if (descriptors.length === 0) {
    descriptors = localBySemanticTokens.get(semanticTokenKey(item.name)) ?? [];
    method = 'exact_semantic_tokens';
  }

  if (descriptors.length > 0) {
    const candidates = descriptors
      .map((descriptor) => analyzeCandidate(item, descriptor, 1, method))
      .sort(compareCandidateRank);
    const bestRank = candidates[0]?.presentationRank;
    const best = bestRank === undefined
      ? []
      : candidates.filter((candidate) => candidate.presentationRank === bestRank);
    if (best.length !== 1) {
      return proposal(
        dux,
        'ambiguous',
        method,
        null,
        best[0]?.presentationRelation ?? null,
        [],
        candidates,
        ['multiple_equally_compatible_local_products'],
      );
    }
    const selected = best[0];
    if (selected === undefined) throw new Error('Candidato editorial ausente.');
    const decision = exactDecision(selected);
    return proposal(
      dux,
      decision.status,
      method,
      selected.id,
      selected.presentationRelation,
      recommendedFields(selected, decision.allowDescription),
      candidates,
      decision.blockers,
    );
  }

  const fuzzyCandidates = baseMatch.local.candidates
    .map((candidate) => {
      const descriptor = localById.get(candidate.id);
      return descriptor === undefined
        ? null
        : analyzeCandidate(
            item,
            descriptor,
            candidate.score,
            candidate.reasons.join('+'),
          );
    })
    .filter((candidate) => candidate !== null)
    .sort((left, right) => right.score - left.score || compareCandidateRank(left, right));
  const first = fuzzyCandidates[0];
  const second = fuzzyCandidates[1];
  if (first === undefined || first.score < FUZZY_REVIEW_SCORE) {
    return proposal(
      dux,
      'no_candidate',
      'none',
      null,
      null,
      [],
      fuzzyCandidates,
      [],
    );
  }
  if (second !== undefined && first.score - second.score < FUZZY_MARGIN) {
    return proposal(
      dux,
      'ambiguous',
      'fuzzy_name_similarity',
      null,
      null,
      [],
      fuzzyCandidates,
      ['fuzzy_candidates_too_close'],
    );
  }
  return proposal(
    dux,
    'review_fuzzy',
    'fuzzy_name_similarity',
    first.id,
    first.presentationRelation,
    recommendedFields(first, false),
    fuzzyCandidates,
    ['manual_confirmation_required'],
  );
}

function exactDecision(candidate) {
  if (candidate.presentationIntegrity === 'conflict') {
    return Object.freeze({
      status: 'review_full',
      allowDescription: false,
      blockers: Object.freeze(['local_presentation_conflict']),
    });
  }
  if (
    candidate.presentationRelation === 'same' ||
    candidate.presentationRelation === 'none'
  ) {
    return Object.freeze({
      status: 'auto_full',
      allowDescription: true,
      blockers: Object.freeze([]),
    });
  }
  if (
    candidate.presentationRelation === 'local_missing' ||
    candidate.presentationRelation === 'dux_missing'
  ) {
    return Object.freeze({
      status: 'review_full',
      allowDescription: candidate.descriptionEligible,
      blockers: Object.freeze(['presentation_not_confirmed_on_both_sides']),
    });
  }
  return Object.freeze({
    status: 'review_image',
    allowDescription: false,
    blockers: Object.freeze(['presentation_mismatch']),
  });
}

function proposal(
  dux,
  status,
  method,
  selectedLocalId,
  presentationRelation,
  fields,
  candidates,
  blockers,
) {
  return {
    dux,
    status,
    method,
    selectedLocalId,
    presentationRelation,
    recommendedFields: Object.freeze(fields),
    candidates: Object.freeze(candidates),
    blockers: Object.freeze(blockers),
  };
}

function duxSummary(item, quantified) {
  const price = publicPrice(item);
  return Object.freeze({
    code: item.code,
    name: item.name,
    publicPrice: price,
    priceQuality:
      price === null
        ? 'missing_or_zero'
        : price === 1 || price === 2
          ? 'placeholder'
          : 'usable',
    quantified,
    categories: Object.freeze([
      ...(item.category === null ? [] : [item.category.name]),
      ...(item.subcategory === null ? [] : [item.subcategory.name]),
    ]),
  });
}

function analyzeCandidate(item, descriptor, score, reason) {
  const duxPresentation = presentationFingerprint(item.name);
  const localPresentation = descriptor.effectivePresentation;
  const presentationRelation = comparePresentation(duxPresentation, localPresentation);
  return Object.freeze({
    id: descriptor.product.id,
    name: descriptor.product.name,
    sku: descriptor.product.sku ?? null,
    presentation: descriptor.product.presentation ?? null,
    hasImage: descriptor.product.images.length > 0,
    hasDescription: descriptor.product.description !== undefined,
    descriptionEligible: descriptionEligible(item, descriptor),
    presentationRelation,
    presentationRank: presentationRank(presentationRelation),
    presentationSource: descriptor.presentationSource,
    presentationIntegrity: descriptor.presentationIntegrity,
    score: roundScore(score),
    reason,
  });
}

function recommendedFields(candidate, allowDescription) {
  const fields = [];
  if (candidate.hasImage) fields.push('images');
  if (allowDescription && candidate.descriptionEligible) fields.push('description');
  return fields;
}

function localDescriptor(product) {
  const explicitPresentation = uniqueStrings([
    ...presentationFingerprint(product.name),
    ...presentationFingerprint(product.presentation ?? ''),
  ]);
  const descriptionPresentation = descriptionPresentationFingerprint(
    product.description ?? '',
  );
  const presentationIntegrity =
    explicitPresentation.length > 0 &&
    descriptionPresentation.length > 0 &&
    !samePresentation(explicitPresentation, descriptionPresentation)
      ? 'conflict'
      : 'ok';
  const effectivePresentation = explicitPresentation.length > 0
    ? explicitPresentation
    : descriptionPresentation;
  return Object.freeze({
    product,
    semanticNameKey: semanticNameKey(product.name),
    semanticTokenKey: semanticTokenKey(product.name),
    explicitPresentation,
    descriptionPresentation,
    effectivePresentation,
    presentationSource:
      explicitPresentation.length > 0
        ? 'name_or_field'
        : descriptionPresentation.length > 0
          ? 'description'
          : 'none',
    presentationIntegrity,
  });
}

function descriptionEligible(item, descriptor) {
  if (descriptor.product.description === undefined) return false;
  if (descriptor.descriptionPresentation.length === 0) return true;
  const duxPresentation = presentationFingerprint(item.name);
  return duxPresentation.length > 0 &&
    samePresentation(duxPresentation, descriptor.descriptionPresentation);
}

function buildDuplicateSemanticGroups(descriptors) {
  const grouped = groupByKey(descriptors, (descriptor) => descriptor.semanticNameKey);
  return Object.freeze([...grouped.entries()]
    .filter(([key, values]) => key !== '' && values.length > 1)
    .map(([semanticName, values]) => Object.freeze({
      semanticName,
      products: Object.freeze(values
        .map((descriptor) => localCandidateSummary(
          descriptor,
          null,
          'duplicate_semantic_name',
        ))
        .sort((left, right) => compareText(left.name, right.name))),
    }))
    .sort((left, right) => compareText(left.semanticName, right.semanticName)));
}

function localCandidateSummary(descriptor, relation, reason) {
  return Object.freeze({
    id: descriptor.product.id,
    name: descriptor.product.name,
    sku: descriptor.product.sku ?? null,
    presentation: descriptor.product.presentation ?? null,
    effectivePresentation: descriptor.effectivePresentation.join(' | '),
    presentationRelation: relation,
    presentationIntegrity: descriptor.presentationIntegrity,
    hasImage: descriptor.product.images.length > 0,
    hasDescription: descriptor.product.description !== undefined,
    reason,
  });
}

function downgradeSharedFullLinks(proposals) {
  const claims = new Map();
  proposals.forEach((proposalValue, index) => {
    if (!isAutoStatus(proposalValue.status) || proposalValue.selectedLocalId === null) return;
    const indices = claims.get(proposalValue.selectedLocalId) ?? [];
    indices.push(index);
    claims.set(proposalValue.selectedLocalId, indices);
  });
  for (const indices of claims.values()) {
    if (indices.length <= 1) continue;
    const confirmed = indices.filter((index) =>
      proposals[index]?.status === 'confirmed_identity');
    const conflicts = confirmed.length === 1
      ? indices.filter((index) => index !== confirmed[0])
      : indices;
    for (const index of conflicts) {
      const current = proposals[index];
      if (current === undefined) continue;
      current.status = 'ambiguous';
      current.selectedLocalId = null;
      current.presentationRelation = null;
      current.recommendedFields = Object.freeze([]);
      current.blockers = Object.freeze([
        ...current.blockers,
        'shared_local_product_claim',
      ]);
    }
  }
}

function presentationRank(relation) {
  switch (relation) {
    case 'same': return 50;
    case 'none': return 40;
    case 'local_missing': return 30;
    case 'dux_missing': return 20;
    case 'different': return 10;
    default: throw new Error(`Relación de presentación desconocida: ${relation}`);
  }
}

function comparePresentation(duxPresentation, localPresentation) {
  if (duxPresentation.length === 0 && localPresentation.length === 0) return 'none';
  if (duxPresentation.length === 0) return 'dux_missing';
  if (localPresentation.length === 0) return 'local_missing';
  return samePresentation(duxPresentation, localPresentation) ? 'same' : 'different';
}

function compareCandidateRank(left, right) {
  return right.presentationRank - left.presentationRank ||
    right.score - left.score ||
    compareText(left.name, right.name);
}

function semanticNameKey(value) {
  return normalizeMatchName(value)
    .replaceAll(CANONICAL_PRESENTATION_PATTERN, ' ')
    .replaceAll(SEMANTIC_NOISE_PATTERN, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

function semanticTokenKey(value) {
  return uniqueStrings(semanticNameKey(value).split(' ')
    .filter((token) => token !== ''))
    .join(' ');
}

function normalizeMatchName(value) {
  return foldDiacritics(value.normalize('NFKC').toLocaleLowerCase('es-AR'))
    .replaceAll(PRESENTATION_SEPARATOR_PATTERN, '$1')
    .replaceAll(
      PRESENTATION_QUANTITY_PATTERN,
      (_match, amount, unit) => canonicalPresentationQuantity(amount, unit),
    )
    .replaceAll(/[^\p{L}\p{N}.]+/gu, ' ')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

function foldDiacritics(value) {
  let folded = '';
  for (const character of value) {
    const decomposed = character.normalize('NFD');
    if (decomposed === 'n\u0303') {
      folded += 'ñ';
      continue;
    }
    folded += decomposed.replaceAll(/\p{M}+/gu, '');
  }
  return folded;
}

function canonicalPresentationQuantity(amount, unit) {
  const normalizedUnit = unit.toLocaleLowerCase('es-AR');
  if (/^(?:kilogramos?|kilos?|kgs?|kg)$/u.test(normalizedUnit)) {
    return `${canonicalDecimalAmount(amount, 1_000n)} g`;
  }
  if (/^(?:gramos?|grs?|gr|g)$/u.test(normalizedUnit)) {
    return `${canonicalDecimalAmount(amount, 1n)} g`;
  }
  if (/^(?:litros?|lts?|lt|l)$/u.test(normalizedUnit)) {
    return `${canonicalDecimalAmount(amount, 1_000n)} ml`;
  }
  return `${canonicalDecimalAmount(amount, 1n)} ml`;
}

function canonicalDecimalAmount(value, multiplier) {
  const [integerPart = '0', fractionPart = ''] = value.replace(',', '.').split('.');
  const scale = 10n ** BigInt(fractionPart.length);
  const unscaled = (BigInt(integerPart) * scale) + BigInt(fractionPart || '0');
  const converted = unscaled * multiplier;
  const integer = converted / scale;
  const remainder = converted % scale;
  if (remainder === 0n) return integer.toString();
  const fraction = remainder
    .toString()
    .padStart(fractionPart.length, '0')
    .replaceAll(/0+$/gu, '');
  return `${integer}.${fraction}`;
}

function presentationFingerprint(value) {
  return Object.freeze(uniqueStrings([
    ...normalizeMatchName(value).matchAll(CANONICAL_PRESENTATION_PATTERN),
  ].map((match) => `${match[1]} ${match[2]}`)));
}

function descriptionPresentationFingerprint(value) {
  const quantities = [];
  for (const line of value.split(/\r?\n/gu)) {
    if (!normalizeMatchName(line).includes('fraccion minima')) continue;
    quantities.push(...presentationFingerprint(line));
  }
  return Object.freeze(uniqueStrings(quantities));
}

function samePresentation(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function publicPrice(item) {
  const matches = item.prices.filter((price) =>
    price.name.toLocaleUpperCase('es-AR') === PRICE_LIST);
  const match = matches.length === 1 ? matches[0] : undefined;
  return match !== undefined && Number.isFinite(match.amount) && match.amount > 0
    ? match.amount
    : null;
}

function groupByKey(values, keySelector) {
  const grouped = new Map();
  for (const value of values) {
    const key = keySelector(value);
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }
  return grouped;
}

function countStatus(proposals, status) {
  return proposals.filter((proposalValue) => proposalValue.status === status).length;
}

function isAutoStatus(status) {
  return status === 'confirmed_identity' || status === 'auto_full';
}

function uniqueStrings(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function roundScore(value) {
  return Math.round(value * 10_000) / 10_000;
}

function compareText(left, right) {
  return left.localeCompare(right, 'es-AR', { sensitivity: 'base' });
}

function validateInputs(source, report) {
  if (
    typeof source !== 'object' || source === null || Array.isArray(source) ||
    source.schemaVersion !== 1 || source.readOnly !== true ||
    source.priceListName !== PRICE_LIST ||
    !Array.isArray(source.duxItems) ||
    !Array.isArray(source.localProducts) ||
    !Array.isArray(source.inventoryUnits) ||
    typeof source.mercadoLibre !== 'object' || source.mercadoLibre === null ||
    !Array.isArray(source.mercadoLibre.units)
  ) {
    throw new Error('El origen read-only no es válido.');
  }
  if (
    typeof report !== 'object' || report === null || Array.isArray(report) ||
    report.readOnly !== true || !Array.isArray(report.matches) ||
    report.generatedAt !== source.generatedAt ||
    report.matches.length !== source.duxItems.length
  ) {
    throw new Error('El informe base no corresponde al origen indicado.');
  }
}

function runCli() {
  const sourcePath = process.argv[2];
  const reportPath = process.argv[3];
  const outputPath = process.argv[4];
  if (sourcePath === undefined || reportPath === undefined || outputPath === undefined) {
    throw new Error(
      'Uso: node scripts/analyze-dux-editorial-links.mjs <origen.json> <informe-base.json> <directorio-salida>',
    );
  }
  const source = JSON.parse(readFileSync(resolve(sourcePath), 'utf8'));
  const baseReport = JSON.parse(readFileSync(resolve(reportPath), 'utf8'));
  const report = buildDuxEditorialLinkAnalysis(source, baseReport);
  const outputDirectory = resolve(outputPath);
  mkdirSync(outputDirectory, { recursive: true });

  writeJson(outputDirectory, 'dux-editorial-link-report.json', report);
  writeJson(outputDirectory, 'dux-editorial-link-summary.json', {
    generatedAt: report.generatedAt,
    policy: report.policy,
    thresholds: report.thresholds,
    sources: report.sources,
    quality: report.quality,
    summary: report.summary,
  });
  writeCsv(
    outputDirectory,
    'dux-editorial-link-plan.csv',
    proposalHeaders(),
    report.proposals.map(proposalRow),
  );
  writeCsv(
    outputDirectory,
    'auto-confirmable-links.csv',
    proposalHeaders(),
    report.proposals.filter((value) => isAutoStatus(value.status)).map(proposalRow),
  );
  writeCsv(
    outputDirectory,
    'manual-review-links.csv',
    proposalHeaders(),
    report.proposals
      .filter((value) => value.status !== 'no_candidate' && !isAutoStatus(value.status))
      .map(proposalRow),
  );
  writeCsv(
    outputDirectory,
    'dux-catalog-quality.csv',
    [
      'dux_code',
      'dux_name',
      'public_price',
      'price_quality',
      'quantified',
      'categories',
    ],
    report.qualityItems.map((value) => [
      value.dux.code,
      value.dux.name,
      value.dux.publicPrice,
      value.dux.priceQuality,
      value.dux.quantified,
      value.dux.categories.join(' | '),
    ]),
  );
  writeCsv(
    outputDirectory,
    'local-duplicate-semantic-groups.csv',
    [
      'semantic_name',
      'local_ids',
      'local_names',
      'presentations',
      'presentation_integrities',
    ],
    report.duplicateSemanticGroups.map((group) => [
      group.semanticName,
      group.products.map((product) => product.id).join(' | '),
      group.products.map((product) => product.name).join(' | '),
      group.products.map((product) => product.effectivePresentation).join(' | '),
      group.products.map((product) => product.presentationIntegrity).join(' | '),
    ]),
  );

  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    quality: report.quality,
    summary: report.summary,
  }, null, 2)}\n`);
}

function proposalHeaders() {
  return [
    'dux_code',
    'dux_name',
    'public_price',
    'price_quality',
    'quantified',
    'status',
    'method',
    'selected_local_id',
    'presentation_relation',
    'recommended_fields',
    'candidate_ids',
    'candidate_names',
    'candidate_presentations',
    'candidate_scores',
    'candidate_reasons',
    'blockers',
  ];
}

function proposalRow(value) {
  return [
    value.dux.code,
    value.dux.name,
    value.dux.publicPrice,
    value.dux.priceQuality,
    value.dux.quantified,
    value.status,
    value.method,
    value.selectedLocalId,
    value.presentationRelation,
    value.recommendedFields.join(' | '),
    value.candidates.map((candidate) => candidate.id).join(' | '),
    value.candidates.map((candidate) => candidate.name).join(' | '),
    value.candidates.map((candidate) => candidate.presentationRelation).join(' | '),
    value.candidates.map((candidate) => candidate.score).join(' | '),
    value.candidates.map((candidate) => candidate.reason).join(' | '),
    value.blockers.join(' | '),
  ];
}

function writeJson(directory, filename, value) {
  writeFileSync(
    resolve(directory, filename),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

function writeCsv(directory, filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  writeFileSync(resolve(directory, filename), `${lines.join('\r\n')}\r\n`, 'utf8');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error no tipado.';
    process.stderr.write(`No se pudo generar el plan editorial: ${message}\n`);
    process.exitCode = 1;
  }
}
