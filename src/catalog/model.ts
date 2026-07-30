export type ProductPrice = Readonly<{
  amount: number;
  currency: 'ARS';
}>;

export type ProductImage = Readonly<{
  src: string;
  alt: string;
}>;

export type CatalogVariantOption = Readonly<{
  name: string;
  value: string;
}>;

export type CatalogVariant = Readonly<{
  title?: string;
  price: ProductPrice;
  salePrice?: ProductPrice;
  sku?: string;
  available: boolean;
  options: readonly CatalogVariantOption[];
}>;

export type CatalogCategory = Readonly<{
  slug: string;
  path: string;
  name: string;
  productCount: number;
}>;

export type CatalogProductSummary = Readonly<{
  id: string;
  slug: string;
  path: string;
  name: string;
  categorySlugs: readonly string[];
  categoryNames: readonly string[];
  presentation?: string;
  price: ProductPrice;
  salePrice?: ProductPrice;
  sku?: string;
  availability?: string;
  shortDescription?: string;
  primaryImage?: ProductImage;
}>;

export type Product = CatalogProductSummary;

export type CatalogProductDetail = CatalogProductSummary &
  Readonly<{
    description?: string;
    images: readonly ProductImage[];
    variants: readonly CatalogVariant[];
  }>;

export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredText(source: Record<string, unknown>, field: string): string {
  const value = source[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidProductError(`El campo "${field}" debe ser un texto no vacío.`);
  }

  return value.trim();
}

function readOptionalText(source: Record<string, unknown>, field: string): string | undefined {
  if (!Object.hasOwn(source, field) || source[field] === undefined) {
    return undefined;
  }

  return readRequiredText(source, field);
}

function parsePrice(value: unknown, field = 'price'): ProductPrice {
  if (!isRecord(value)) {
    throw new InvalidProductError(`El campo "${field}" debe ser un precio válido.`);
  }

  if (
    typeof value.amount !== 'number' ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0
  ) {
    throw new InvalidProductError('El importe debe ser un número finito y positivo.');
  }

  if (value.currency !== 'ARS') {
    throw new InvalidProductError('La moneda admitida para el catálogo es ARS.');
  }

  return Object.freeze({ amount: value.amount, currency: value.currency });
}

function parseImage(value: unknown): ProductImage {
  if (!isRecord(value)) {
    throw new InvalidProductError('La imagen debe ser un objeto válido.');
  }

  const src = readRequiredText(value, 'src');
  if (!/^\/images\/original\/catalog\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(src)) {
    throw new InvalidProductError(`La imagen debe usar una ruta local autorizada: ${src}.`);
  }

  return Object.freeze({ src, alt: readRequiredText(value, 'alt') });
}

function parseTextArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidProductError(`El campo "${field}" debe ser una colección.`);
  }

  const result = value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new InvalidProductError(`El campo "${field}" contiene un texto inválido.`);
    }
    return item.trim();
  });

  if (new Set(result).size !== result.length) {
    throw new InvalidProductError(`El campo "${field}" contiene duplicados.`);
  }

  return Object.freeze(result);
}

export function parseCategory(value: unknown): CatalogCategory {
  if (!isRecord(value)) {
    throw new InvalidProductError('La categoría debe ser un objeto válido.');
  }

  const slug = readRequiredText(value, 'slug');
  const categoryPath = readRequiredText(value, 'path');
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(slug) || categoryPath !== `/tienda/categoria/${slug}/`) {
    throw new InvalidProductError(`La categoría "${slug}" no tiene un slug o path seguro.`);
  }
  if (!Number.isInteger(value.productCount) || Number(value.productCount) < 0) {
    throw new InvalidProductError(`La categoría "${slug}" no tiene un conteo válido.`);
  }

  return Object.freeze({
    slug,
    path: categoryPath,
    name: readRequiredText(value, 'name'),
    productCount: Number(value.productCount),
  });
}

export function parseCategories(values: readonly unknown[]): readonly CatalogCategory[] {
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const categories = values.map((value) => {
    const category = parseCategory(value);
    if (slugs.has(category.slug) || paths.has(category.path)) {
      throw new InvalidProductError(`La categoría "${category.slug}" está duplicada.`);
    }
    slugs.add(category.slug);
    paths.add(category.path);
    return category;
  });

  return Object.freeze(categories);
}

export function parseProduct(value: unknown): Product {
  if (!isRecord(value)) {
    throw new InvalidProductError('El producto debe ser un objeto válido.');
  }

  const id = readRequiredText(value, 'id');
  const slug = readRequiredText(value, 'slug');
  const productPath = readRequiredText(value, 'path');
  if (
    id !== slug ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(slug) ||
    productPath !== `/${slug}/`
  ) {
    throw new InvalidProductError(`El producto "${slug}" no tiene un ID, slug o path seguro.`);
  }

  const categorySlugs = parseTextArray(value.categorySlugs, 'categorySlugs');
  const categoryNames = parseTextArray(value.categoryNames, 'categoryNames');
  if (categorySlugs.length !== categoryNames.length) {
    throw new InvalidProductError(`Las categorías de "${slug}" no coinciden.`);
  }

  const salePrice = Object.hasOwn(value, 'salePrice')
    ? parsePrice(value.salePrice, 'salePrice')
    : undefined;
  const primaryImage = Object.hasOwn(value, 'primaryImage')
    ? parseImage(value.primaryImage)
    : undefined;
  const presentation = readOptionalText(value, 'presentation');
  const sku = readOptionalText(value, 'sku');
  const availability = readOptionalText(value, 'availability');
  const shortDescription = readOptionalText(value, 'shortDescription');

  return Object.freeze({
    id,
    slug,
    path: productPath,
    name: readRequiredText(value, 'name'),
    categorySlugs,
    categoryNames,
    ...(presentation === undefined ? {} : { presentation }),
    price: parsePrice(value.price),
    ...(salePrice === undefined ? {} : { salePrice }),
    ...(sku === undefined ? {} : { sku }),
    ...(availability === undefined ? {} : { availability }),
    ...(shortDescription === undefined ? {} : { shortDescription }),
    ...(primaryImage === undefined ? {} : { primaryImage }),
  });
}

export function parseProducts(
  values: readonly unknown[],
  categories: readonly CatalogCategory[] = [],
): readonly Product[] {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const products = values.map((value) => {
    const product = parseProduct(value);
    if (ids.has(product.id) || slugs.has(product.slug) || paths.has(product.path)) {
      throw new InvalidProductError(`El producto "${product.slug}" está duplicado.`);
    }
    if (categories.length > 0) {
      product.categorySlugs.forEach((categorySlug, index) => {
        const category = categoryBySlug.get(categorySlug);
        if (category === undefined || category.name !== product.categoryNames[index]) {
          throw new InvalidProductError(
            `La categoría "${categorySlug}" de "${product.slug}" no existe.`,
          );
        }
      });
    }
    ids.add(product.id);
    slugs.add(product.slug);
    paths.add(product.path);
    return product;
  });

  return Object.freeze(products);
}

function parseVariant(value: unknown): CatalogVariant {
  if (!isRecord(value) || typeof value.available !== 'boolean' || !Array.isArray(value.options)) {
    throw new InvalidProductError('La variante debe ser un objeto válido.');
  }

  const options = Object.freeze(
    value.options.map((option) => {
      if (!isRecord(option)) {
        throw new InvalidProductError('La opción de variante debe ser un objeto válido.');
      }
      return Object.freeze({
        name: readRequiredText(option, 'name'),
        value: readRequiredText(option, 'value'),
      });
    }),
  );
  const salePrice = Object.hasOwn(value, 'salePrice')
    ? parsePrice(value.salePrice, 'salePrice')
    : undefined;
  const title = readOptionalText(value, 'title');
  const sku = readOptionalText(value, 'sku');

  return Object.freeze({
    ...(title === undefined ? {} : { title }),
    price: parsePrice(value.price),
    ...(salePrice === undefined ? {} : { salePrice }),
    ...(sku === undefined ? {} : { sku }),
    available: value.available,
    options,
  });
}

export function parseProductDetail(
  summary: Product,
  value: unknown,
): CatalogProductDetail {
  if (!isRecord(value) || !Array.isArray(value.images) || !Array.isArray(value.variants)) {
    throw new InvalidProductError(`El detalle de "${summary.slug}" no es válido.`);
  }

  const images = Object.freeze(value.images.map(parseImage));
  if ((summary.primaryImage?.src ?? null) !== (images[0]?.src ?? null)) {
    throw new InvalidProductError(`La imagen principal de "${summary.slug}" no coincide.`);
  }
  const variants = Object.freeze(value.variants.map(parseVariant));
  const description = readOptionalText(value, 'description');

  return Object.freeze({
    ...summary,
    ...(description === undefined ? {} : { description }),
    images,
    variants,
  });
}
