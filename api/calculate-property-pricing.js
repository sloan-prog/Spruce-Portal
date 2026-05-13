const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getConfig(configRows, key, fallback = 0) {
  const row = configRows.find(r => r.config_key === key);
  return row ? num(row.config_value, fallback) : fallback;
}

function itemCost(catalogRows, itemCode) {
  const item = catalogRows.find(i => i.item_code === itemCode);
  return item ? num(item.cost_per_unit, 0) : 0;
}

function linenItemCost(catalogRows, itemCode, qty) {
  return itemCost(catalogRows, itemCode) * qty;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const bedrooms = num(body.bedrooms);
    const bathrooms = num(body.bathrooms);
    const sleeps = num(body.sleeps);
    const sqFt = num(body.sq_ft);

    const planType = body.plan_type || 'SIMPLY';
    const coffeeEnabled = body.coffee_enabled === true || body.coffee_enabled === 'true';
    const coffeeType = body.coffee_type || null;

    const annualBookings = num(body.annual_bookings);
    const adr = num(body.adr);

    const king = num(body.king);
    const queen = num(body.queen);
    const fullBeds = num(body.full_beds);
    const twin = num(body.twin);
    const sofa = num(body.sofa); // sofa counts as full

    const totalBeds = king + queen + fullBeds + twin + sofa;
    const fullEquivalent = fullBeds + sofa;

    const { data: configRows, error: configError } = await supabase
      .from('spruce_config')
      .select('*');

    if (configError) {
      return res.status(400).json({ success: false, error: configError.message });
    }

    const { data: catalogRows, error: catalogError } = await supabase
      .from('item_catalog')
      .select('item_code,item_name,category,cost_per_unit,cost_per_pack,units_per_pack,active');

    if (catalogError) {
      return res.status(400).json({ success: false, error: catalogError.message });
    }

    const { data: usageRules, error: rulesError } = await supabase
      .from('item_usage_rules')
      .select('*')
      .eq('active', true);

    if (rulesError) {
      return res.status(400).json({ success: false, error: rulesError.message });
    }

    const { data: laundryWeights, error: laundryError } = await supabase
      .from('linen_laundry_weights')
      .select('*');

    if (laundryError) {
      return res.status(400).json({ success: false, error: laundryError.message });
    }

    const payRate = getConfig(configRows, 'pay_rate_per_hr', 31);
    const laundryRate = getConfig(configRows, 'laundry_rate_per_lb', 1.2);
    const simplyMarkupPct = getConfig(configRows, 'simply_markup_pct', 52);
    const signatureMarkupPct = getConfig(configRows, 'signature_markup_pct', 87);
    const linenFeeCharged = bedrooms * linenFeePerBed;
    const sheetPar = getConfig(configRows, 'sheet_par', 2);
    const towelPar = getConfig(configRows, 'towel_par', 3);
    const puraSqFtThreshold = getConfig(configRows, 'pura_sqft_threshold', 1200);

    const cleanTimeBase = getConfig(configRows, 'clean_time_base_hours', 1.5);
    const cleanTimePerBath = getConfig(configRows, 'clean_time_per_bathroom_hours', 0.5);
    const cleanTimePerBedroom = getConfig(configRows, 'clean_time_per_bedroom_hours', 0.5);

    const estimatedCleanHours =
      cleanTimeBase +
      (cleanTimePerBath * bathrooms) +
      (cleanTimePerBedroom * bedrooms);

    const laborCost = estimatedCleanHours * payRate;

    // Consumables from rules + item catalog
    let consumablesCost = 0;
    const consumableBreakdown = [];

    usageRules.forEach(rule => {
      const applies =
        rule.applies_to_plan_type === 'ALL' ||
        rule.applies_to_plan_type === planType;

      if (!applies) return;

      const catalogItem = catalogRows.find(i => i.item_code === rule.item_code);
      if (!catalogItem) return;

      // Avoid including sheets/towels in consumables. Those are handled in linen/laundry logic.
      if (catalogItem.category === 'SHEETS' || catalogItem.category === 'TOWELS') return;

      const qty =
        (rule.is_fixed ? num(rule.fixed_qty) : 0) +
        (num(rule.usage_per_clean) * 1) +
        (num(rule.usage_per_bedroom) * bedrooms) +
        (num(rule.usage_per_bathroom) * bathrooms) +
        (num(rule.usage_per_guest) * sleeps);

      if (qty <= 0) return;

      const unitCost = num(catalogItem.cost_per_unit);
      const total = qty * unitCost;

      consumablesCost += total;

      consumableBreakdown.push({
        item_code: rule.item_code,
        item_name: catalogItem.item_name,
        qty_per_clean: roundMoney(qty),
        unit_cost: roundMoney(unitCost),
        total_cost: roundMoney(total)
      });
    });

    // Coffee special rules
    let coffeeCost = 0;
    let coffeeBreakdown = [];

    if (coffeeEnabled) {
      const cups = Math.ceil(sleeps * 2.5);

      let coffeePodsQty = 0;
      let coffeeBagsQty = 0;

      if (coffeeType === 'PODS') {
        coffeePodsQty = cups;
      }

      if (coffeeType === 'GROUND') {
        coffeeBagsQty = 1;
      }

      if (coffeeType === 'BOTH') {
        coffeePodsQty = Math.ceil(cups * 0.5);
        coffeeBagsQty = 1;
      }

      const sugarQty = cups;
      const creamerQty = cups;
      const stirrerQty = cups;

      const coffeeItems = [
        { item_code: 'CON-016', qty: coffeePodsQty },
        { item_code: 'CON-017', qty: coffeeBagsQty },
        { item_code: 'CON-013', qty: sugarQty },
        { item_code: 'CON-015', qty: creamerQty },
        { item_code: 'CON-014', qty: stirrerQty }
      ].filter(i => i.qty > 0);

      coffeeBreakdown = coffeeItems.map(i => {
        const catalogItem = catalogRows.find(c => c.item_code === i.item_code);
        const unitCost = itemCost(catalogRows, i.item_code);
        const total = i.qty * unitCost;
        coffeeCost += total;

        return {
          item_code: i.item_code,
          item_name: catalogItem ? catalogItem.item_name : i.item_code,
          qty_per_clean: roundMoney(i.qty),
          unit_cost: roundMoney(unitCost),
          total_cost: roundMoney(total)
        };
      });
    }

    // Pura / scenting
    const puraDeviceCount = sqFt > puraSqFtThreshold ? 2 : 1;
    const puraDeviceCost = itemCost(catalogRows, 'SCT-001') * puraDeviceCount;

    // For now, device is onboarding/capex, not per-clean operating cost.
    const scentingCostPerClean = 0;

    // Signature welcome gift
    const welcomeGiftCost = planType === 'SIGNATURE'
      ? itemCost(catalogRows, 'GFT-001')
      : 0;

    // Linen order estimate
    const linenOrder = [];

    function addLinen(item_code, qty) {
      if (qty <= 0) return;
      const catalogItem = catalogRows.find(i => i.item_code === item_code);
      const unitCost = itemCost(catalogRows, item_code);
      const total = unitCost * qty;

      linenOrder.push({
        item_code,
        item_name: catalogItem ? catalogItem.item_name : item_code,
        qty,
        unit_cost: roundMoney(unitCost),
        total_cost: roundMoney(total)
      });
    }

    // Sheets/topcovers, PAR 2
    addLinen('SHT-001', king * sheetPar); // King fitted
    addLinen('SHT-002', king * sheetPar); // King flat
    addLinen('SHT-003', king * 4 * sheetPar); // King pillowcases
    addLinen('SHT-005', king * sheetPar); // King topcover

    addLinen('SHT-009', queen * sheetPar);
    addLinen('SHT-010', queen * sheetPar);
    addLinen('SHT-011', queen * 4 * sheetPar);
    addLinen('SHT-013', queen * sheetPar);

    addLinen('SHT-014', fullEquivalent * sheetPar);
    addLinen('SHT-015', fullEquivalent * sheetPar);
    addLinen('SHT-016', fullEquivalent * 2 * sheetPar);
    addLinen('SHT-018', fullEquivalent * sheetPar);

    addLinen('SHT-019', twin * sheetPar);
    addLinen('SHT-020', twin * sheetPar);
    addLinen('SHT-021', twin * 1 * sheetPar);
    addLinen('SHT-023', twin * sheetPar);

    // Towels PAR 3
    addLinen('TWL-001', sleeps * towelPar); // Bath towels
    addLinen('TWL-002', sleeps * towelPar); // Washcloths
    addLinen('TWL-003', sleeps * towelPar); // Hand towels
    addLinen('TWL-004', bathrooms * towelPar); // Bath mats
    addLinen('TWL-006', 2 * towelPar); // Kitchen towels
    addLinen('TWL-007', 2 * towelPar); // Kitchen washcloths
    addLinen('MSC-001', 2); // Laundry bags starter

    const totalLinenOrderCost = linenOrder.reduce(
      (sum, row) => sum + Number(row.total_cost || 0),
      0
    );

    const linenFeeCharged = totalBeds * linenFeePerBed;
    const linenToRecoup = Math.max(totalLinenOrderCost - linenFeeCharged, 0);
    const annualCleans = annualBookings;
    const linenRecoupPerClean = annualCleans > 0 ? linenToRecoup / annualCleans : 0;

    // Max laundry weight per clean
    let maxLaundryWeightLbs = 0;

    const linenQtyByCode = {};
    linenOrder.forEach(row => {
      linenQtyByCode[row.item_code] = (linenQtyByCode[row.item_code] || 0) + row.qty;
    });

    laundryWeights.forEach(w => {
      const qty = linenQtyByCode[w.item_code] || 0;
      maxLaundryWeightLbs += qty * num(w.weight_lbs);
    });

    const laundryCost = maxLaundryWeightLbs * laundryRate;

    const baseCost =
      laborCost +
      laundryCost +
      consumablesCost +
      coffeeCost +
      scentingCostPerClean +
      welcomeGiftCost +
      linenRecoupPerClean;

    const markupPct = planType === 'SIGNATURE'
      ? signatureMarkupPct
      : simplyMarkupPct;

    const recommendedCleaningFee = baseCost * (1 + markupPct / 100);

    const qualifiesByBookingOpen = true; // placeholder until booking open % fields are added

    return res.status(200).json({
      success: true,
      inputs: {
        bedrooms,
        bathrooms,
        sleeps,
        sq_ft: sqFt,
        plan_type: planType,
        coffee_enabled: coffeeEnabled,
        coffee_type: coffeeType,
        annual_bookings: annualBookings,
        adr,
        beds: {
          king,
          queen,
          full_beds: fullBeds,
          sofa_as_full: sofa,
          twin,
          total_beds: totalBeds
        }
      },
      outputs: {
        estimated_clean_hours: roundMoney(estimatedCleanHours),
        labor_cost: roundMoney(laborCost),
        max_laundry_weight_lbs: roundMoney(maxLaundryWeightLbs),
        laundry_cost: roundMoney(laundryCost),
        consumables_cost: roundMoney(consumablesCost),
        coffee_cost: roundMoney(coffeeCost),
        welcome_gift_cost: roundMoney(welcomeGiftCost),
        pura_device_count: puraDeviceCount,
        pura_device_onboarding_cost: roundMoney(puraDeviceCost),
        linen_order_cost: roundMoney(totalLinenOrderCost),
        linen_fee_charged: roundMoney(linenFeeCharged),
        linen_to_recoup: roundMoney(linenToRecoup),
        linen_recoup_per_clean: roundMoney(linenRecoupPerClean),
        base_cost: roundMoney(baseCost),
        markup_pct: markupPct,
        recommended_cleaning_fee: roundMoney(recommendedCleaningFee),
        qualifies_by_booking_open: qualifiesByBookingOpen
      },
      breakdowns: {
        consumables: consumableBreakdown,
        coffee: coffeeBreakdown,
        linen_order: linenOrder
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
