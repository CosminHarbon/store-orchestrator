import assert from 'node:assert/strict';
import type { StorefrontProductOption, StorefrontVariant } from './types';
import {
  addToCartCta,
  cartLineKey,
  findVariantBySelection,
  isVariantMatrixPending,
  nextVariantSelection,
  valueAvailability,
  type VariantSelection,
} from './variantSelection';

function option(
  id: string,
  name: string,
  values: { id: string; value: string }[],
  position = 0
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
    })),
  };
}

function variant(
  id: string,
  optionValueIds: string[],
  extras: Partial<StorefrontVariant> = {}
): StorefrontVariant {
  return {
    id,
    sku: extras.sku ?? null,
    price_override: extras.price_override ?? null,
    effective_price: extras.effective_price ?? 10,
    final_price: extras.final_price ?? 10,
    original_price: extras.original_price ?? 10,
    has_discount: extras.has_discount ?? false,
    stock: extras.stock ?? 5,
    active: extras.active ?? true,
    option_value_ids: optionValueIds,
  };
}

const size = option('size', 'Size', [
  { id: 's', value: 'S' },
  { id: 'm', value: 'M' },
  { id: 'l', value: 'L' },
]);
const colour = option('colour', 'Colour', [
  { id: 'black', value: 'Black' },
  { id: 'white', value: 'White' },
  { id: 'pink', value: 'Pink' },
]);
const material = option('material', 'Material', [
  { id: 'cotton', value: 'Cotton' },
  { id: 'linen', value: 'Linen' },
]);

const twoOptionVariants = [
  variant('s-black', ['s', 'black']),
  variant('s-white', ['s', 'white']),
  variant('m-black', ['m', 'black']),
  variant('m-white', ['m', 'white'], { active: false, stock: 0, final_price: 999.99 }),
  variant('l-black', ['l', 'black'], { stock: 0 }),
];

function select(
  options: StorefrontProductOption[],
  variants: StorefrontVariant[],
  start: VariantSelection,
  steps: [string, string][]
) {
  return steps.reduce(
    (selection, [optionId, valueId]) =>
      nextVariantSelection(options, variants, selection, optionId, valueId),
    start
  );
}

// 1. Loading vs unavailable
assert.equal(
  isVariantMatrixPending({ has_variants: true } as never),
  true,
  'missing options on a variant product is loading, not empty'
);
assert.equal(
  isVariantMatrixPending({ has_variants: true, options: [] } as never),
  false,
  'loaded empty options is not loading'
);
assert.equal(addToCartCta([], {}, null, { matrixPending: true }).kind, 'loading');
assert.equal(addToCartCta([], {}, null).kind, 'unavailable');
assert.equal(
  addToCartCta([size, colour], { size: null, colour: null }, null).kind,
  'select_option'
);
assert.equal(
  addToCartCta([size, colour], { size: null, colour: null }, null).optionName,
  'Size'
);

// 2. Switching Size must ignore the current Size value (never AND S with M)
assert.equal(
  valueAvailability(twoOptionVariants, { size: 's', colour: 'black' }, 'size', 'm'),
  'available',
  'M stays available while S is selected'
);
assert.equal(
  valueAvailability(twoOptionVariants, { size: 's', colour: 'black' }, 'size', 's'),
  'available'
);
assert.equal(
  valueAvailability(twoOptionVariants, { size: 'm', colour: 'black' }, 'colour', 'pink'),
  'unavailable',
  'Pink does not exist for any size'
);

// 3. Changing Size clears a now-impossible Colour
const afterPinkThenM = select(
  [size, colour],
  [
    variant('s-black', ['s', 'black']),
    variant('s-pink', ['s', 'pink']),
    variant('m-black', ['m', 'black']),
  ],
  { size: 's', colour: 'pink' },
  [['size', 'm']]
);
assert.equal(afterPinkThenM.size, 'm');
assert.equal(afterPinkThenM.colour, null, 'Pink is cleared when M has no Pink combo');

const afterMThenBlack = select(
  [size, colour],
  twoOptionVariants,
  { size: 's', colour: 'black' },
  [['size', 'm']]
);
assert.equal(afterMThenBlack.size, 'm');
assert.equal(afterMThenBlack.colour, 'black', 'Black is kept when M/Black exists');

// Inactive combo is unavailable and gets cleared
const afterInactiveWhite = select(
  [size, colour],
  twoOptionVariants,
  { size: 's', colour: 'white' },
  [['size', 'm']]
);
assert.equal(afterInactiveWhite.size, 'm');
assert.equal(
  afterInactiveWhite.colour,
  null,
  'White is cleared because M/White is inactive'
);

// OOS but active stays selected
const afterL = select(
  [size, colour],
  twoOptionVariants,
  { size: 's', colour: 'black' },
  [['size', 'l']]
);
assert.equal(afterL.size, 'l');
assert.equal(afterL.colour, 'black', 'OOS L/Black stays selected');
assert.equal(
  addToCartCta([size, colour], afterL, findVariantBySelection(twoOptionVariants, afterL)).kind,
  'out_of_stock'
);

// 4. Three-option product: Size × Colour × Material = 8
const threeOptions = [size, colour, material].map((entry, index) =>
  option(entry.id, entry.name, entry.values.slice(0, 2), index)
);
const threeVariants = ['s', 'm'].flatMap((sizeId) =>
  ['black', 'white'].flatMap((colourId) =>
    ['cotton', 'linen'].map((materialId) =>
      variant(`${sizeId}-${colourId}-${materialId}`, [sizeId, colourId, materialId])
    )
  )
);
assert.equal(threeVariants.length, 8);

const walk = select(
  threeOptions,
  threeVariants,
  { size: null, colour: null, material: null },
  [
    ['size', 's'],
    ['colour', 'black'],
    ['material', 'cotton'],
    ['size', 'm'],
    ['colour', 'white'],
    ['material', 'linen'],
    ['size', 's'],
    ['colour', 'black'],
  ]
);
assert.deepEqual(walk, { size: 's', colour: 'black', material: 'linen' });
const resolved = findVariantBySelection(threeVariants, walk);
assert.equal(resolved?.id, 's-black-linen');

const missingLinenOnM = [
  ...threeVariants.filter((row) => row.id !== 'm-black-linen'),
];
const clearedMaterial = select(
  threeOptions,
  missingLinenOnM,
  { size: 's', colour: 'black', material: 'linen' },
  [['size', 'm']]
);
assert.equal(clearedMaterial.size, 'm');
assert.equal(clearedMaterial.colour, 'black');
assert.equal(clearedMaterial.material, null, 'Linen cleared when M/Black/Linen is absent');

// 5. Cart line keys
const mBlack = cartLineKey('tee', 'm-black');
const lBlack = cartLineKey('tee', 'l-black');
assert.notEqual(mBlack, lBlack);
assert.equal(mBlack, cartLineKey('tee', 'm-black'));
assert.equal(cartLineKey('simple'), 'simple');

let cart = [
  { lineKey: mBlack, qty: 2 },
  { lineKey: lBlack, qty: 1 },
];
const bump = (key: string, qty: number) => {
  cart = cart
    .map((line) => (line.lineKey === key ? { ...line, qty } : line))
    .filter((line) => line.qty > 0);
};
bump(mBlack, 3);
assert.deepEqual(cart, [
  { lineKey: mBlack, qty: 3 },
  { lineKey: lBlack, qty: 1 },
]);
bump(mBlack, 2);
assert.equal(cart.find((line) => line.lineKey === lBlack)?.qty, 1);
bump(mBlack, 0);
assert.deepEqual(cart, [{ lineKey: lBlack, qty: 1 }]);
cart = [...cart, { lineKey: mBlack, qty: 1 }];
assert.equal(cart.length, 2);
assert.equal(new Set(cart.map((line) => line.lineKey)).size, 2);

console.log('variantSelection tests passed');
