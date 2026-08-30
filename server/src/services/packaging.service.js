'use strict';

const { ConflictError, ValidationError } = require('../lib/errors');

/**
 * Converts what an operator types into the base units stock is kept in.
 *
 * The whole carton feature lives here. `stock.service.js` never learns that
 * cartons exist: it receives base units and its invariants - the conditional
 * decrement, the ledger sum, the thresholds - are untouched. That is the point.
 * A conversion applied in two places is a conversion that will disagree with
 * itself.
 */

/**
 * @param {{unitsPerCarton: number|null}} product
 * @param {'UNIT'|'CARTON'} packaging
 * @param {number} quantity  as entered, in `packaging` units
 * @returns {number} base units
 */
function toBaseQuantity(product, packaging, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ConflictError('QUANTITY_MUST_BE_POSITIVE');
  }

  if (packaging === 'UNIT') return quantity;

  if (packaging === 'CARTON') {
    const factor = product.unitsPerCarton;
    // Refusing is the only safe answer: guessing 1 would post a twelfth of the
    // goods and leave the ledger quietly wrong.
    if (!factor || factor < 1) {
      throw new ValidationError([{ path: 'packaging', rule: 'PRODUCT_NOT_SOLD_BY_CARTON' }]);
    }
    return quantity * factor;
  }

  throw new ConflictError('UNKNOWN_PACKAGING');
}

/**
 * The price to bill for one `packaging` unit.
 *
 * The carton price is entered explicitly rather than derived from the unit
 * price, so a wholesale rate survives a change to the retail price. A product
 * sold by the carton without a carton price is a data error, not something to
 * paper over with a multiplication the operator never agreed to.
 */
function unitPriceFor(product, packaging) {
  if (packaging === 'CARTON') {
    if (product.cartonSellPrice == null) {
      throw new ValidationError([{ path: 'packaging', rule: 'CARTON_PRICE_MISSING' }]);
    }
    return product.cartonSellPrice;
  }
  return product.sellPrice;
}

/**
 * Resolves a submitted document line into what gets stored.
 * `unitPrice` is snapshotted here so a reprinted invoice shows what was billed.
 */
function resolveIssueLine(product, line) {
  const packaging = line.packaging ?? 'UNIT';
  return {
    productId: product.id,
    quantity: line.quantity,
    packaging,
    baseQuantity: toBaseQuantity(product, packaging, line.quantity),
    unitPrice: line.unitPrice ?? unitPriceFor(product, packaging),
  };
}

function resolveReceiptLine(product, line) {
  const packaging = line.packaging ?? 'UNIT';
  return {
    productId: product.id,
    quantity: line.quantity,
    packaging,
    baseQuantity: toBaseQuantity(product, packaging, line.quantity),
    unitPrice: line.unitPrice ?? 0,
    lotNumber: line.lotNumber ?? null,
  };
}

/**
 * Splits a base quantity into whole cartons and a remainder, for display.
 * 148 bottles at 12 per carton -> "12 cartons + 4".
 */
function describeInCartons(baseQuantity, unitsPerCarton) {
  if (!unitsPerCarton || unitsPerCarton < 2) return null;
  return {
    cartons: Math.floor(baseQuantity / unitsPerCarton),
    remainder: baseQuantity % unitsPerCarton,
  };
}

module.exports = {
  toBaseQuantity,
  unitPriceFor,
  resolveIssueLine,
  resolveReceiptLine,
  describeInCartons,
};
