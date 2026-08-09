/**
 * Todo termina en el pliego.
 *
 * Una imprenta compra el papel como se lo venden —por kilo, por resma, a veces
 * por pliego suelto— pero produce y cobra en pliegos: la prensa y la guillotina
 * se pagan por hora y su rendimiento se mide en pliegos por hora. El pliego es
 * el átomo donde se encuentran las dos mitades del costo, la del material y la
 * de la máquina:
 *
 *     pliegos × $/pliego                    → costo de material
 *     pliegos ÷ pliegos-hora × $/hora       → costo de máquina
 *
 * Mientras el precio viva en unidades distintas sin conversión declarada, esas
 * dos cuentas no se pueden sumar. Antes se sumaban igual: kg, resma y unidad
 * entraban todos al motor como `substrate_per_kg`, así que un precio por resma
 * se cobraba como si fuera por kilo.
 *
 * La conversión no es una constante sino geometría: el peso de un pliego sale
 * de su superficie por su gramaje. Un 70×100 de 300 g pesa 210 gramos; el mismo
 * gramaje en el pliego máximo de una Ryobi 524GS —37×52— pesa 58. El mismo
 * papel, el mismo precio por kilo, y casi cuatro veces de diferencia por pliego.
 */

/** Una resma son 500 pliegos. Es convención de la industria, no un parámetro. */
export const SHEETS_PER_REAM = 500;

/** Unidades en que se compra un sustrato. */
export type PurchaseUnit = 'kg' | 'resma' | 'pliego' | 'unit';

export interface SheetSpec {
	/** Ancho del pliego en centímetros. */
	widthCm: number;
	/** Alto del pliego en centímetros. */
	heightCm: number;
	/** Gramaje en g/m². */
	gsm: number;
	/** Pliegos por paquete cuando se compra por resma. Por defecto 500. */
	sheetsPerPackage?: number;
}

const positive = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** Superficie de un pliego, en metros cuadrados. */
export function sheetAreaM2(spec: Pick<SheetSpec, 'widthCm' | 'heightCm'>): number | null {
	const w = positive(spec.widthCm);
	const h = positive(spec.heightCm);
	if (w === null || h === null) return null;
	return (w / 100) * (h / 100);
}

/** Lo que pesa un pliego, en kilos. Superficie × gramaje. */
export function sheetWeightKg(spec: SheetSpec): number | null {
	const area = sheetAreaM2(spec);
	const gsm = positive(spec.gsm);
	if (area === null || gsm === null) return null;
	return (area * gsm) / 1000;
}

/** Cuántos pliegos salen de una cantidad de kilos. */
export function sheetsFromKg(kg: number, spec: SheetSpec): number | null {
	const weight = sheetWeightKg(spec);
	const k = positive(kg);
	if (weight === null || k === null) return null;
	return k / weight;
}

/** Cuántos kilos pesan una cantidad de pliegos. */
export function kgFromSheets(sheets: number, spec: SheetSpec): number | null {
	const weight = sheetWeightKg(spec);
	if (weight === null || sheets < 0) return null;
	return sheets * weight;
}

export interface PriceInSomeUnit {
	value: number;
	unit: PurchaseUnit;
}

/**
 * El precio de UN pliego, venga como venga el material.
 *
 * Devuelve `null` cuando falta la geometría necesaria en vez de adivinarla:
 * un costo de papel inventado es exactamente lo que este módulo existe para
 * impedir.
 */
export function costPerSheet(price: PriceInSomeUnit, spec: SheetSpec): number | null {
	const value = positive(price.value);
	if (value === null) return null;

	switch (price.unit) {
		case 'pliego':
			return value;

		case 'resma': {
			const per = positive(spec.sheetsPerPackage) ?? SHEETS_PER_REAM;
			return value / per;
		}

		case 'kg': {
			const weight = sheetWeightKg(spec);
			return weight === null ? null : value * weight;
		}

		// 'unit' es ambigua a propósito: sin saber qué es una unidad de ese
		// material, convertirla sería inventar. Que lo resuelva quien la cargó.
		default:
			return null;
	}
}

/** El precio por kilo equivalente, para comparar materiales entre sí. */
export function costPerKg(price: PriceInSomeUnit, spec: SheetSpec): number | null {
	if (price.unit === 'kg') return positive(price.value);
	const perSheet = costPerSheet(price, spec);
	const weight = sheetWeightKg(spec);
	if (perSheet === null || weight === null || weight === 0) return null;
	return perSheet / weight;
}

// ── El otro lado del pliego: la máquina ─────────────────────────────────────

/**
 * Horas de máquina para una cantidad de pliegos.
 *
 * Se usa la velocidad ÓPTIMA y no la nominal: la nominal es la de catálogo del
 * fabricante, que ninguna prensa sostiene con papel real, arreglo y cambios de
 * tinta. Costear con la nominal subestima sistemáticamente las horas, y las
 * horas son la mitad del costo de un trabajo.
 */
export function pressHoursForSheets(
	sheets: number,
	speed: { optimalSheetsPerHour?: number | null; nominalSheetsPerHour?: number | null },
): number | null {
	const s = positive(sheets);
	if (s === null) return null;
	const rate = positive(speed.optimalSheetsPerHour) ?? positive(speed.nominalSheetsPerHour);
	return rate === null ? null : s / rate;
}

/**
 * El costo de un trabajo en una máquina, desde los pliegos.
 * Es la unión de las dos mitades: material y máquina se suman aquí porque
 * ambas llegaron al pliego.
 */
export interface SheetJobCost {
	sheets: number;
	materialCost: number | null;
	machineHours: number | null;
	machineCost: number | null;
	total: number | null;
}

export function sheetJobCost(args: {
	sheets: number;
	price: PriceInSomeUnit;
	spec: SheetSpec;
	speed: { optimalSheetsPerHour?: number | null; nominalSheetsPerHour?: number | null };
	machineRatePerHour: number | null | undefined;
}): SheetJobCost {
	const perSheet = costPerSheet(args.price, args.spec);
	const materialCost = perSheet === null ? null : perSheet * args.sheets;
	const machineHours = pressHoursForSheets(args.sheets, args.speed);
	const rate = positive(args.machineRatePerHour);
	const machineCost = machineHours === null || rate === null ? null : machineHours * rate;

	return {
		sheets: args.sheets,
		materialCost,
		machineHours,
		machineCost,
		// Un total parcial es peor que ninguno: si falta una mitad, no se suma.
		total: materialCost === null || machineCost === null ? null : materialCost + machineCost,
	};
}
