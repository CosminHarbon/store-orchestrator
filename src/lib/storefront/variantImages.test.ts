import assert from 'node:assert/strict';
import type { StorefrontProduct, StorefrontProductOption } from './types';
import {
  productWithResolvedCartImage,
  resolveProductImagesForSelection,
  resolveVariantDisplayImage,
  selectionFromValueIds,
} from './variantImages';
import type { StorefrontVariant } from './types';

function option(
  id: string,
  name: string,
  position: number,
  values: { id: string; value: string; image_ids?: string[] }[]
): StorefrontProductOption {
  return {
    id,
    name,
    position,
    values: values.map((value, index) => ({
      id: value.id,
      value: value.value,
      position: index,
      swatch_hex: null,
      image_ids: value.image_ids || [],
    })),
  };
}

const colour = option('colour', 'Colour', 1, [
  { id: 'black', value: 'Black', image_ids: ['A', 'B'] },
  { id: 'white', value: 'White', image_ids: ['C'] },
  { id: 'red', value: 'Red' },
]);
const material = option('material', 'Material', 2, [
  { id: 'leather', value: 'Leather', image_ids: ['B', 'C'] },
]);
const size = option('size', 'Size', 0, [
  { id: 's', value: 'S' },
  { id: 'm', value: 'M' },
]);

const product: StorefrontProduct = {
  id: 'p1',
  title: 'Tee',
  description: '',
  price: 10,
  original_price: 10,
  has_discount: false,
  discount_percentage: 0,
  image: 'url-A',
  images: [
    { id: 'A', image_url: 'url-A', is_primary: true },
    { id: 'B', image_url: 'url-B' },
    { id: 'C', image_url: 'url-C' },
    { id: 'D', image_url: 'url-D' },
    { id: 'E', image_url: 'url-E' },
  ],
  stock: 5,
  sku: 'TEE',
  category: '',
  collection_ids: [],
  has_variants: true,
  options: [size, colour, material],
};

const ids = (selection: Record<string, string | null>) =>
  resolveProductImagesForSelection(product, selection).map((image) => image.id);

assert.deepEqual(ids({}), ['A', 'B', 'C', 'D', 'E']);
assert.deepEqual(ids({ colour: 'black' }), ['A', 'B', 'C', 'D', 'E']);
assert.equal(ids({ colour: 'black' })[0], 'A');
assert.equal(ids({ colour: 'black' })[1], 'B');
assert.deepEqual(ids({ colour: 'white' }).slice(0, 1), ['C']);
assert.deepEqual(ids({ colour: 'red' }), ['A', 'B', 'C', 'D', 'E']);
assert.deepEqual(ids({ colour: 'black', material: 'leather' }), ['A', 'B', 'C', 'D', 'E']);
assert.deepEqual(
  resolveProductImagesForSelection(product, { colour: 'black', material: 'leather' }).map(
    (image) => image.id
  ),
  ['A', 'B', 'C', 'D', 'E']
);

assert.equal(resolveVariantDisplayImage(product, { colour: 'white' }), 'url-C');
assert.equal(resolveVariantDisplayImage(product, { colour: 'red' }), 'url-A');

const variant: StorefrontVariant = {
  id: 'v1',
  effective_price: 10,
  final_price: 10,
  original_price: 10,
  has_discount: false,
  stock: 2,
  active: true,
  option_value_ids: ['m', 'black'],
};
const lined = productWithResolvedCartImage(product, variant);
assert.equal(lined.image, 'url-A');

assert.deepEqual(selectionFromValueIds(product.options, ['m', 'white']), {
  size: 'm',
  colour: 'white',
  material: null,
});

const simple: StorefrontProduct = { ...product, has_variants: false, options: undefined, variants: undefined };
assert.deepEqual(
  resolveProductImagesForSelection(simple, {}).map((image) => image.id),
  ['A', 'B', 'C', 'D', 'E']
);

const gapped = {
  ...product,
  options: [
    option('colour', 'Colour', 1, [{ id: 'black', value: 'Black', image_ids: ['E', 'A'] }]),
  ],
};
assert.deepEqual(
  resolveProductImagesForSelection(gapped, { colour: 'black' }).map((image) => image.id),
  ['E', 'A', 'B', 'C', 'D']
);

const noParentImage: StorefrontProduct = {
  ...product,
  image: '',
  images: [
    { id: 'G1', image_url: 'url-G1', is_primary: true },
    { id: 'G2', image_url: 'url-G2' },
  ],
  has_variants: false,
  options: undefined,
  variants: undefined,
};
assert.equal(resolveVariantDisplayImage(noParentImage, {}), 'url-G1');

const empty: StorefrontProduct = {
  ...product,
  image: '',
  images: [],
  has_variants: false,
  options: undefined,
  variants: undefined,
};
assert.equal(resolveVariantDisplayImage(empty, {}), '');

console.log('variantImages tests passed');
