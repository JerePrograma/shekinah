export type ProductPrice = Readonly<{
  amount: number;
  currency: 'ARS';
}>;

export type Product = Readonly<{
  id: string;
  name: string;
  category: string;
  presentation: string;
  price?: ProductPrice;
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

function readRequiredText(
  source: Record<string, unknown>,
  field: 'id' | 'name' | 'category' | 'presentation',
): string {
  const value = source[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidProductError(`El campo "${field}" debe ser un texto no vacío.`);
  }

  return value.trim();
}

function parsePrice(value: unknown): ProductPrice {
  if (!isRecord(value)) {
    throw new InvalidProductError('El precio debe ser un objeto válido.');
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

  return Object.freeze({
    amount: value.amount,
    currency: value.currency,
  });
}

export function parseProduct(value: unknown): Product {
  if (!isRecord(value)) {
    throw new InvalidProductError('El producto debe ser un objeto válido.');
  }

  const baseProduct = {
    id: readRequiredText(value, 'id'),
    name: readRequiredText(value, 'name'),
    category: readRequiredText(value, 'category'),
    presentation: readRequiredText(value, 'presentation'),
  };

  if (!Object.hasOwn(value, 'price') || value.price === undefined) {
    return Object.freeze(baseProduct);
  }

  return Object.freeze({
    ...baseProduct,
    price: parsePrice(value.price),
  });
}

export function parseProducts(values: readonly unknown[]): readonly Product[] {
  const ids = new Set<string>();
  const products = values.map((value) => {
    const product = parseProduct(value);

    if (ids.has(product.id)) {
      throw new InvalidProductError(`El identificador "${product.id}" está duplicado.`);
    }

    ids.add(product.id);
    return product;
  });

  return Object.freeze(products);
}
