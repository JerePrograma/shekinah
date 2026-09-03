import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRICE_LIST = 'PRECIOS DEL NEGOCIO';
const MAX_CANDIDATES = 5;
const MIN_REVIEW_SCORE = 0.65;
const SUGGESTION_SCORE = 0.9;
const SUGGESTION_MARGIN = 0.08;
const PRESENTATION_QUANTITY_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}])/giu;
const PRESENTATION_SEPARATOR_PATTERN =
  /(^|\s)[x×](?=\s*\d+(?:[.,]\d+)?\s*(?:kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}]))/giu;
const CANONICAL_PRESENTATION_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:\.\d+)?)\s(g|ml)(?![\p{L}\p{N}])/gu;

export function buildDuxCatalogMatchingAnalysis(input) {
  const generatedAt = requiredTimestamp(input.generatedAt);
  const localDescriptors = input.localProducts.map(localDescriptor);
  const localById = new Map(
    localDescriptors.map((descriptor) => [descriptor.product.id, descriptor]),
  );
  const localByIdentifier = groupByKeys(
    localDescriptors,
    (descriptor) => descriptor.identifiers,
  );
  const localByExactName = groupByKeys(
    localDescriptors,
    (descriptor) => descriptor.exactNameKey === null
      ? []
      : [descriptor.exactNameKey],
  );
  const inventoryByCode = groupInventoryUnits(input.inventoryUnits);

  const workingMatches = input.duxItems.map((item) => buildWorkingMatch(
    item,
    inventoryByCode.get(item.code) ?? Object.freeze([]),
    localDescriptors,
    localById,
    localByIdentifier,
    localByExactName,
  ));
  applySharedLocalConflicts(workingMatches);

  const publications = groupMercadoLibrePublications(input.mercadoLibre.units);
  const publicationsBySku = groupByKeys(
    publications,
    (publication) => publication.sellerSkus.map(normalizeIdentifier),
  );
  const publicationsByLocalId = groupByKeys(
    publications,
    (publication) => publication.localProductIds,
  );
  const publicationsByTitle = groupByKeys(
    publications,
    (publication) => publication.titles.map(normalizeMatchName),
  );

  const relatedLocalIds = new Set();
  const confirmedLocalIds = new Set();
  const usedMercadoLibreIds = new Set();
  const allowMercadoLibreEditorial = input.mercadoLibre.freshByLegacyThreshold === true;

  const matches = workingMatches.map((working) => {
    const localCandidates = finalizeLocalCandidates(working);
    if (working.status !== 'dux_only') {
      for (const candidate of localCandidates) relatedLocalIds.add(candidate.id);
    }
    if (working.status === 'confirmed' && working.selectedId !== null) {
      confirmedLocalIds.add(working.selectedId);
    }
    const selectedLocal = working.selectedId === null
      ? undefined
      : localById.get(working.selectedId)?.product;
    const mercadoLibre = resolveMercadoLibreRelation(
      working.item,
      working.selectedId,
      publicationsBySku,
      publicationsByLocalId,
      publicationsByTitle,
      allowMercadoLibreEditorial,
    );
    for (const candidate of mercadoLibre.candidates) {
      usedMercadoLibreIds.add(candidate.itemId);
    }
    const hasLocalImage = selectedLocal !== undefined && selectedLocal.images.length > 0;
    const hasLocalDescription = selectedLocal?.description !== undefined;
    const canFillImageFromMercadoLibre =
      !hasLocalImage && mercadoLibre.imageCandidateUrl !== null;

    return Object.freeze({
      dux: Object.freeze({
        code: working.item.code,
        name: working.item.name,
        publicPrice: publicPrice(working.item),
        categoryNames: Object.freeze([
          ...(working.item.category === null ? [] : [working.item.category.name]),
          ...(working.item.subcategory === null ? [] : [working.item.subcategory.name]),
        ]),
        quantifiedInventoryUnits: working.inventoryUnits.length,
        hasProviderImage: working.item.imageUrl !== null,
        hasProviderDescription: working.item.description !== null,
      }),
      local: Object.freeze({
        status: working.status,
        selectedId: working.selectedId,
        candidates: localCandidates,
      }),
      mercadoLibre,
      editorial: Object.freeze({
        hasLocalImage,
        hasLocalDescription,
        canFillImageFromMercadoLibre,
        missingImage:
          !hasLocalImage &&
          mercadoLibre.imageCandidateUrl === null &&
          working.item.imageUrl === null,
        missingDescription:
          !hasLocalDescription && working.item.description === null,
      }),
    });
  });

  const localOnly = Object.freeze(localDescriptors
    .filter((descriptor) => !relatedLocalIds.has(descriptor.product.id))
    .map((descriptor) => localSummary(descriptor.product))
    .sort(compareNames));
  const mercadoLibreOnly = Object.freeze(publications
    .filter((publication) => !usedMercadoLibreIds.has(publication.itemId))
    .map(publicationCandidate)
    .sort((left, right) => compareText(left.title, right.title)));
  const uniqueMercadoLibre = matches.filter((match) =>
    match.mercadoLibre.status === 'exact_sku' ||
    match.mercadoLibre.status === 'triangulated_local' ||
    match.mercadoLibre.status === 'exact_title');
  const quantifiedCodes = new Set(
    input.inventoryUnits
      .filter((unit) => unit.lastSyncStatus !== 'absent')
      .map((unit) => unit.itemCode),
  );

  return Object.freeze({
    generatedAt,
    readOnly: true,
    policy: Object.freeze({
      authority: Object.freeze({
        existence: 'dux',
        name: 'dux',
        price: 'dux',
        stock: 'dux',
      }),
      local: 'editorial_enrichment_only',
      mercadoLibre: 'editorial_evidence_only',
      writesPerformed: false,
    }),
    thresholds: Object.freeze({
      minimumReviewScore: MIN_REVIEW_SCORE,
      suggestionScore: SUGGESTION_SCORE,
      suggestionMargin: SUGGESTION_MARGIN,
    }),
    sources: Object.freeze({
      dux: Object.freeze({
        itemCount: input.duxItems.length,
        publicPriceCoverage: input.duxItems.filter((item) => publicPrice(item) !== null).length,
        quantifiedItemCount: input.duxItems.filter((item) => quantifiedCodes.has(item.code)).length,
        unquantifiedItemCount: input.duxItems.filter((item) => !quantifiedCodes.has(item.code)).length,
      }),
      local: Object.freeze({
        productCount: input.localProducts.length,
        withSku: input.localProducts.filter((product) => localIdentifiers(product).length > 0).length,
        withImage: input.localProducts.filter((product) => product.images.length > 0).length,
        withDescription: input.localProducts.filter((product) => product.description !== undefined).length,
      }),
      mercadoLibre: Object.freeze({
        available: input.mercadoLibre.available,
        connectionPresent: input.mercadoLibre.connectionPresent,
        mode: 'd1_mirror',
        publicationCount: publications.length,
        unitCount: input.mercadoLibre.units.length,
        withImage: publications.filter((publication) => publication.primaryImageUrls.length > 0).length,
        latestSyncedAt: input.mercadoLibre.latestSyncedAt,
        latestRunStatus: input.mercadoLibre.latestRunStatus,
        latestRunCompletedAt: input.mercadoLibre.latestRunCompletedAt,
        freshByLegacyThreshold: input.mercadoLibre.freshByLegacyThreshold,
        invalidRowCount: input.mercadoLibre.invalidRowCount,
      }),
    }),
    summary: Object.freeze({
      confirmedOneToOne: matches.filter((match) => match.local.status === 'confirmed').length,
      suggestedOneToOne: matches.filter((match) => match.local.status === 'suggested').length,
      ambiguous: matches.filter((match) => match.local.status === 'ambiguous').length,
      duxOnly: matches.filter((match) => match.local.status === 'dux_only').length,
      localOnly: localOnly.length,
      localWithoutConfirmedLink: input.localProducts.length - confirmedLocalIds.size,
      duxWithReusableLocalImage: matches.filter((match) => match.editorial.hasLocalImage).length,
      duxWithReusableLocalDescription: matches.filter((match) => match.editorial.hasLocalDescription).length,
      duxWithUniqueMercadoLibrePublication: uniqueMercadoLibre.length,
      duxWithMercadoLibreImageCandidate: matches.filter(
        (match) => match.mercadoLibre.imageCandidateUrl !== null,
      ).length,
      duxWithoutImageCandidate: matches.filter((match) => match.editorial.missingImage).length,
      duxWithoutDescription: matches.filter((match) => match.editorial.missingDescription).length,
      mercadoLibreOnlyPublications: mercadoLibreOnly.length,
    }),
    matches: Object.freeze(matches),
    localOnly,
    mercadoLibreOnly,
  });
}

function buildWorkingMatch(
  item,
  inventoryUnits,
  localDescriptors,
  localById,
  localByIdentifier,
  localByExactName,
) {
  const candidates = new Map();
  let hardAmbiguous = false;
  const activeUnits = inventoryUnits.filter((unit) => unit.lastSyncStatus !== 'absent');
  const mappedIds = new Set(activeUnits.flatMap((unit) =>
    unit.mappingStatus === 'mapped' && unit.localProductId !== null
      ? [unit.localProductId]
      : []));
  const ambiguousIds = new Set(activeUnits.flatMap((unit) =>
    unit.mappingStatus === 'ambiguous' ? unit.mappingCandidates : []));
  const fullyMapped =
    activeUnits.length > 0 &&
    mappedIds.size === 1 &&
    activeUnits.every((unit) =>
      unit.mappingStatus === 'mapped' && unit.localProductId !== null);

  if (fullyMapped) {
    for (const id of mappedIds) {
      addCandidate(candidates, localById.get(id), 'persisted_inventory_mapping', 1, true);
    }
  } else if (mappedIds.size > 0 || ambiguousIds.size > 0) {
    hardAmbiguous = true;
    for (const id of [...mappedIds, ...ambiguousIds]) {
      addCandidate(candidates, localById.get(id), 'inventory_mapping_conflict', 1, true);
    }
  }

  const codeKey = normalizeIdentifier(item.code);
  for (const descriptor of localByIdentifier.get(codeKey) ?? []) {
    addCandidate(candidates, descriptor, 'dux_code_equals_local_sku', 1, true);
  }
  for (const externalCode of new Set(activeUnits.flatMap((unit) =>
    unit.externalCode === null ? [] : [unit.externalCode]))) {
    addCandidate(
      candidates,
      localById.get(externalCode),
      'dux_external_code_equals_local_id',
      1,
      true,
    );
  }
  for (const barcode of new Set(activeUnits.flatMap((unit) =>
    unit.barcode === null ? [] : [normalizeIdentifier(unit.barcode)]))) {
    for (const descriptor of localByIdentifier.get(barcode) ?? []) {
      addCandidate(
        candidates,
        descriptor,
        'dux_barcode_equals_local_identifier',
        1,
        true,
      );
    }
  }

  const confirmedIds = uniqueStrings([...candidates.values()]
    .filter((candidate) => candidate.confirmed)
    .map((candidate) => candidate.descriptor.product.id));
  let status;
  let selectedId = null;

  if (hardAmbiguous || confirmedIds.length > 1) {
    status = 'ambiguous';
  } else if (confirmedIds.length === 1) {
    status = 'confirmed';
    selectedId = confirmedIds[0] ?? null;
  } else {
    const exactKey = normalizeMatchName(item.name);
    const exact = localByExactName.get(exactKey) ?? [];
    for (const descriptor of exact) {
      addCandidate(candidates, descriptor, 'exact_normalized_name', 0.96, false);
    }
    if (exact.length > 1) {
      status = 'ambiguous';
    } else if (exact.length === 1) {
      status = 'suggested';
      selectedId = exact[0]?.product.id ?? null;
    } else {
      const fuzzy = fuzzyCandidates(item, localDescriptors);
      for (const candidate of fuzzy) {
        addCandidate(
          candidates,
          candidate.descriptor,
          'name_similarity',
          candidate.score,
          false,
        );
      }
      const first = fuzzy[0];
      const second = fuzzy[1];
      if (
        first !== undefined &&
        first.score >= SUGGESTION_SCORE &&
        (second === undefined || first.score - second.score >= SUGGESTION_MARGIN)
      ) {
        status = 'suggested';
        selectedId = first.descriptor.product.id;
      } else {
        status = 'dux_only';
      }
    }
  }

  return {
    item,
    inventoryUnits: activeUnits,
    status,
    selectedId,
    candidates,
  };
}

function applySharedLocalConflicts(matches) {
  const claims = new Map();
  matches.forEach((match, index) => {
    if (
      match.selectedId === null ||
      (match.status !== 'confirmed' && match.status !== 'suggested')
    ) {
      return;
    }
    const indices = claims.get(match.selectedId) ?? [];
    indices.push(index);
    claims.set(match.selectedId, indices);
  });

  for (const [localId, indices] of claims) {
    if (indices.length <= 1) continue;
    const confirmed = indices.filter((index) => matches[index]?.status === 'confirmed');
    const conflicts = confirmed.length === 1
      ? indices.filter((index) => index !== confirmed[0])
      : indices;
    for (const index of conflicts) {
      const match = matches[index];
      if (match === undefined) continue;
      match.status = 'ambiguous';
      match.selectedId = null;
      const candidate = match.candidates.get(localId);
      candidate?.reasons.add('shared_local_candidate');
    }
  }
}

function finalizeLocalCandidates(match) {
  return Object.freeze([...match.candidates.values()]
    .map((candidate) => Object.freeze({
      id: candidate.descriptor.product.id,
      name: candidate.descriptor.product.name,
      sku: candidate.descriptor.product.sku ?? null,
      presentation: candidate.descriptor.product.presentation ?? null,
      hasImage: candidate.descriptor.product.images.length > 0,
      hasDescription: candidate.descriptor.product.description !== undefined,
      score: roundScore(candidate.score),
      reasons: Object.freeze([...candidate.reasons].sort()),
    }))
    .sort((left, right) =>
      right.score - left.score || compareText(left.name, right.name)));
}

function resolveMercadoLibreRelation(
  item,
  selectedLocalId,
  bySku,
  byLocalId,
  byTitle,
  allowEditorialCandidate,
) {
  const exactSku = uniquePublications(bySku.get(normalizeIdentifier(item.code)) ?? []);
  if (exactSku.length === 1) {
    return mercadoLibreResolution('exact_sku', exactSku, allowEditorialCandidate);
  }
  if (exactSku.length > 1) {
    return mercadoLibreResolution('ambiguous', exactSku, false);
  }
  if (selectedLocalId !== null) {
    const triangulated = uniquePublications(byLocalId.get(selectedLocalId) ?? []);
    if (triangulated.length === 1) {
      return mercadoLibreResolution(
        'triangulated_local',
        triangulated,
        allowEditorialCandidate,
      );
    }
    if (triangulated.length > 1) {
      return mercadoLibreResolution('ambiguous', triangulated, false);
    }
  }
  const exactTitle = uniquePublications(
    byTitle.get(normalizeMatchName(item.name)) ?? [],
  );
  if (exactTitle.length === 1) {
    return mercadoLibreResolution('exact_title', exactTitle, allowEditorialCandidate);
  }
  if (exactTitle.length > 1) {
    return mercadoLibreResolution('ambiguous', exactTitle, false);
  }
  return Object.freeze({
    status: 'none',
    selectedItemId: null,
    candidates: Object.freeze([]),
    imageCandidateUrl: null,
  });
}

function mercadoLibreResolution(status, publications, allowEditorialCandidate) {
  const candidates = Object.freeze(publications.map(publicationCandidate));
  const selected = status === 'ambiguous' ? undefined : publications[0];
  const usable =
    allowEditorialCandidate &&
    selected !== undefined &&
    selected.itemStatuses.length === 1 &&
    selected.itemStatuses[0] === 'active' &&
    selected.lastSyncStatuses.length === 1 &&
    selected.lastSyncStatuses[0] === 'ok' &&
    selected.primaryImageUrls.length === 1;
  return Object.freeze({
    status,
    selectedItemId: selected?.itemId ?? null,
    candidates,
    imageCandidateUrl: usable ? selected?.primaryImageUrls[0] ?? null : null,
  });
}

function localDescriptor(product) {
  return Object.freeze({
    product,
    identifiers: localIdentifiers(product),
    exactNameKey: localExactNameKey(product),
    fuzzyNameKey: fuzzyNameKey(`${product.name} ${product.presentation ?? ''}`),
    presentation: presentationFingerprint(`${product.name} ${product.presentation ?? ''}`),
  });
}

function localIdentifiers(product) {
  return Object.freeze(uniqueStrings([
    ...(product.sku === undefined ? [] : [normalizeIdentifier(product.sku)]),
    ...product.variants.flatMap((variant) =>
      variant.sku === undefined ? [] : [normalizeIdentifier(variant.sku)]),
  ].filter((value) => value !== '')));
}

function localExactNameKey(product) {
  const normalizedName = normalizeMatchName(product.name);
  const namePresentation = presentationFingerprint(product.name);
  const explicitPresentation = presentationFingerprint(product.presentation ?? '');
  if (
    namePresentation.length > 0 &&
    explicitPresentation.length > 0 &&
    !samePresentationFingerprint(namePresentation, explicitPresentation)
  ) {
    return null;
  }
  const visiblePresentation = namePresentation.length > 0
    ? namePresentation
    : explicitPresentation;
  const idPresentation = presentationFingerprint(
    product.id.replaceAll(/[-_]+/gu, ' '),
  );
  if (
    idPresentation.length > 0 &&
    visiblePresentation.length > 0 &&
    !samePresentationFingerprint(idPresentation, visiblePresentation)
  ) {
    return null;
  }
  if (namePresentation.length === 0 && explicitPresentation.length > 0) {
    return `${normalizedName} ${explicitPresentation.join(' ')}`;
  }
  return normalizedName;
}

function fuzzyCandidates(item, locals) {
  const itemKey = fuzzyNameKey(item.name);
  const itemPresentation = presentationFingerprint(item.name);
  return Object.freeze(locals
    .map((descriptor) => {
      let score = similarity(itemKey, descriptor.fuzzyNameKey);
      if (itemPresentation.length > 0 && descriptor.presentation.length > 0) {
        score = samePresentationFingerprint(itemPresentation, descriptor.presentation)
          ? Math.min(1, score + 0.05)
          : score * 0.55;
      }
      return Object.freeze({ descriptor, score });
    })
    .filter((candidate) => candidate.score >= MIN_REVIEW_SCORE)
    .sort((left, right) =>
      right.score - left.score ||
      compareText(left.descriptor.product.name, right.descriptor.product.name))
    .slice(0, MAX_CANDIDATES));
}

function addCandidate(candidates, descriptor, reason, score, confirmed) {
  if (descriptor === undefined) return;
  const id = descriptor.product.id;
  const current = candidates.get(id);
  if (current === undefined) {
    candidates.set(id, {
      descriptor,
      score,
      reasons: new Set([reason]),
      confirmed,
    });
    return;
  }
  current.score = Math.max(current.score, score);
  current.confirmed ||= confirmed;
  current.reasons.add(reason);
}

function groupByKeys(values, keys) {
  const grouped = new Map();
  for (const value of values) {
    for (const key of new Set(keys(value))) {
      if (key === '') continue;
      const matches = grouped.get(key) ?? [];
      matches.push(value);
      grouped.set(key, matches);
    }
  }
  return grouped;
}

function groupInventoryUnits(units) {
  const grouped = new Map();
  for (const unit of units) {
    if (unit.lastSyncStatus === 'absent') continue;
    const values = grouped.get(unit.itemCode) ?? [];
    values.push(unit);
    grouped.set(unit.itemCode, values);
  }
  return grouped;
}

function groupMercadoLibrePublications(units) {
  const groups = new Map();
  for (const unit of units) {
    const values = groups.get(unit.itemId) ?? [];
    values.push(unit);
    groups.set(unit.itemId, values);
  }
  return Object.freeze([...groups.entries()]
    .map(([itemId, values]) => Object.freeze({
      itemId,
      sellerSkus: uniqueStrings(values.flatMap((value) =>
        value.sellerSku === null ? [] : [value.sellerSku])),
      localProductIds: uniqueStrings(values.flatMap((value) =>
        value.localProductId === null ? [] : [value.localProductId])),
      titles: uniqueStrings(values.map((value) => value.title)),
      itemStatuses: uniqueStrings(values.map((value) => value.itemStatus)),
      lastSyncStatuses: uniqueStrings(values.map((value) => value.lastSyncStatus)),
      primaryImageUrls: uniqueStrings(values.flatMap((value) =>
        value.primaryImageUrl === null ? [] : [value.primaryImageUrl])),
      permalinks: uniqueStrings(values.flatMap((value) =>
        value.permalink === null ? [] : [value.permalink])),
      lastSyncedAt: maximumTimestamp(values.map((value) => value.lastSyncedAt)) ?? '',
    }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId, 'en')));
}

function uniquePublications(publications) {
  return Object.freeze([
    ...new Map(publications.map((publication) => [publication.itemId, publication])).values(),
  ]);
}

function publicationCandidate(publication) {
  return Object.freeze({
    itemId: publication.itemId,
    sellerSkus: publication.sellerSkus,
    title: publication.titles[0] ?? publication.itemId,
    itemStatuses: publication.itemStatuses,
    lastSyncStatuses: publication.lastSyncStatuses,
    localProductIds: publication.localProductIds,
    primaryImageUrl: publication.primaryImageUrls.length === 1
      ? publication.primaryImageUrls[0] ?? null
      : null,
    permalink: publication.permalinks.length === 1
      ? publication.permalinks[0] ?? null
      : null,
    lastSyncedAt: publication.lastSyncedAt,
  });
}

function localSummary(product) {
  return Object.freeze({
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    presentation: product.presentation ?? null,
    hasImage: product.images.length > 0,
    hasDescription: product.description !== undefined,
  });
}

function publicPrice(item) {
  const matches = item.prices.filter((price) =>
    price.name.toLocaleUpperCase('es-AR') === PRICE_LIST);
  const match = matches.length === 1 ? matches[0] : undefined;
  return match !== undefined && Number.isFinite(match.amount) && match.amount > 0
    ? match.amount
    : null;
}

function normalizeIdentifier(value) {
  return value.trim().toLocaleUpperCase('en');
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

function fuzzyNameKey(value) {
  return normalizeMatchName(value)
    .replaceAll(/\b(?:de|del|la|el|los|las|en|con|sin|para|por)\b/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
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
  return Object.freeze([
    ...normalizeMatchName(value).matchAll(CANONICAL_PRESENTATION_PATTERN),
  ].map((match) => `${match[1]} ${match[2]}`));
}

function samePresentationFingerprint(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function similarity(left, right) {
  if (left === right) return 1;
  if (left === '' || right === '') return 0;
  const tokenScore = diceCoefficient(tokens(left), tokens(right));
  const trigramScore = diceCoefficient(trigrams(left), trigrams(right));
  return (tokenScore * 0.65) + (trigramScore * 0.35);
}

function tokens(value) {
  return new Set(value.split(' ').filter((token) => token !== ''));
}

function trigrams(value) {
  const compact = `  ${value.replaceAll(/\s+/gu, ' ')}  `;
  const result = new Set();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    result.add(compact.slice(index, index + 3));
  }
  return result;
}

function diceCoefficient(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function uniqueStrings(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function maximumTimestamp(values) {
  const valid = values.filter((value) => !Number.isNaN(Date.parse(value))).sort();
  return valid[valid.length - 1] ?? null;
}

function requiredTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('Timestamp de análisis inválido.');
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error('Timestamp de análisis inválido.');
  return value;
}

function roundScore(value) {
  return Math.round(value * 10_000) / 10_000;
}

function compareNames(left, right) {
  return compareText(left.name, right.name);
}

function compareText(left, right) {
  return left.localeCompare(right, 'es-AR', { sensitivity: 'base' });
}

function validateSource(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('El archivo de origen no contiene un objeto JSON.');
  }
  if (value.schemaVersion !== 1 || value.readOnly !== true) {
    throw new Error('El origen no corresponde al esquema read-only esperado.');
  }
  if (value.priceListName !== PRICE_LIST) {
    throw new Error(`La lista pública debe ser ${PRICE_LIST}.`);
  }
  for (const field of ['duxItems', 'localProducts', 'inventoryUnits']) {
    if (!Array.isArray(value[field])) {
      throw new Error(`El campo ${field} no es una lista.`);
    }
  }
  if (
    typeof value.mercadoLibre !== 'object' ||
    value.mercadoLibre === null ||
    !Array.isArray(value.mercadoLibre.units)
  ) {
    throw new Error('Falta la fuente Mercado Libre.');
  }
  return value;
}

function runCli() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (inputPath === undefined || outputPath === undefined) {
    throw new Error(
      'Uso: node scripts/analyze-dux-catalog-matches.mjs <origen.json> <directorio-salida>',
    );
  }
  const source = validateSource(JSON.parse(readFileSync(resolve(inputPath), 'utf8')));
  const report = buildDuxCatalogMatchingAnalysis(source);
  const outputDirectory = resolve(outputPath);
  mkdirSync(outputDirectory, { recursive: true });

  writeJson(outputDirectory, 'catalog-matching-report.json', report);
  writeJson(outputDirectory, 'catalog-matching-summary.json', {
    generatedAt: report.generatedAt,
    policy: report.policy,
    thresholds: report.thresholds,
    sources: report.sources,
    summary: report.summary,
  });
  writeCsv(
    outputDirectory,
    'dux-local-matching.csv',
    [
      'dux_code',
      'dux_name',
      'dux_price',
      'dux_categories',
      'quantified_inventory_units',
      'local_status',
      'selected_local_id',
      'candidate_ids',
      'candidate_names',
      'candidate_scores',
      'candidate_reasons',
      'ml_status',
      'ml_selected_item_id',
      'ml_candidate_item_ids',
      'ml_candidate_titles',
      'ml_image_candidate_url',
      'has_local_image',
      'has_local_description',
      'can_fill_image_from_ml',
      'missing_image',
      'missing_description',
    ],
    report.matches.map((match) => [
      match.dux.code,
      match.dux.name,
      match.dux.publicPrice,
      match.dux.categoryNames.join(' | '),
      match.dux.quantifiedInventoryUnits,
      match.local.status,
      match.local.selectedId,
      match.local.candidates.map((candidate) => candidate.id).join(' | '),
      match.local.candidates.map((candidate) => candidate.name).join(' | '),
      match.local.candidates.map((candidate) => candidate.score).join(' | '),
      match.local.candidates
        .map((candidate) => `${candidate.id}:${candidate.reasons.join('+')}`)
        .join(' | '),
      match.mercadoLibre.status,
      match.mercadoLibre.selectedItemId,
      match.mercadoLibre.candidates.map((candidate) => candidate.itemId).join(' | '),
      match.mercadoLibre.candidates.map((candidate) => candidate.title).join(' | '),
      match.mercadoLibre.imageCandidateUrl,
      match.editorial.hasLocalImage,
      match.editorial.hasLocalDescription,
      match.editorial.canFillImageFromMercadoLibre,
      match.editorial.missingImage,
      match.editorial.missingDescription,
    ]),
  );
  writeCsv(
    outputDirectory,
    'review-required.csv',
    [
      'dux_code',
      'dux_name',
      'status',
      'selected_local_id',
      'candidate_ids',
      'candidate_names',
      'candidate_scores',
      'candidate_reasons',
    ],
    report.matches
      .filter((match) =>
        match.local.status === 'suggested' || match.local.status === 'ambiguous')
      .map((match) => [
        match.dux.code,
        match.dux.name,
        match.local.status,
        match.local.selectedId,
        match.local.candidates.map((candidate) => candidate.id).join(' | '),
        match.local.candidates.map((candidate) => candidate.name).join(' | '),
        match.local.candidates.map((candidate) => candidate.score).join(' | '),
        match.local.candidates
          .map((candidate) => `${candidate.id}:${candidate.reasons.join('+')}`)
          .join(' | '),
      ]),
  );
  writeCsv(
    outputDirectory,
    'local-only.csv',
    ['local_id', 'local_name', 'sku', 'presentation', 'has_image', 'has_description'],
    report.localOnly.map((product) => [
      product.id,
      product.name,
      product.sku,
      product.presentation,
      product.hasImage,
      product.hasDescription,
    ]),
  );
  writeCsv(
    outputDirectory,
    'mercadolibre-only.csv',
    [
      'item_id',
      'seller_skus',
      'title',
      'statuses',
      'sync_statuses',
      'local_product_ids',
      'primary_image_url',
      'permalink',
      'last_synced_at',
    ],
    report.mercadoLibreOnly.map((publication) => [
      publication.itemId,
      publication.sellerSkus.join(' | '),
      publication.title,
      publication.itemStatuses.join(' | '),
      publication.lastSyncStatuses.join(' | '),
      publication.localProductIds.join(' | '),
      publication.primaryImageUrl,
      publication.permalink,
      publication.lastSyncedAt,
    ]),
  );

  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    sources: report.sources,
    summary: report.summary,
  }, null, 2)}\n`);
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
    process.stderr.write(`No se pudo generar el análisis: ${message}\n`);
    process.exitCode = 1;
  }
}
