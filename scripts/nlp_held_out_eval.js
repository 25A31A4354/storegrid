/**
 * StoreGrid NLP Independent Held-Out Evaluation Benchmark
 *
 * Evaluates the live FastAPI NLP microservice (http://127.0.0.1:8000/classify)
 * against a held-out dataset of 42 diverse, realistic retail feedback messages.
 *
 * Includes:
 * - English plain complaints
 * - Telugu-English transliterated code-mixed complaints
 * - Subtle misspellings and real customer phrasing
 * - Multilingual multi-intent conflicts (expected: NEEDS_REVIEW)
 * - Ambiguous / low-information comments (expected: NEEDS_REVIEW)
 * - Unrelated banter (expected: NEEDS_REVIEW)
 */

const fs = require('fs');
const path = require('path');

const NLP_URL = process.env.NLP_SERVICE_URL || 'http://127.0.0.1:8000';

const HELD_OUT_DATASET = [
  // 1. STOCK_SHORTAGE (6 samples)
  { id: 'HO-SS-01', text: 'Visited the dairy section at 5pm and found empty shelves for toned milk.', expected: 'STOCK_SHORTAGE', lang: 'en', type: 'standard' },
  { id: 'HO-SS-02', text: 'Sunflower oil 1L packets are completely out of stock in aisle 2.', expected: 'STOCK_SHORTAGE', lang: 'en', type: 'standard' },
  { id: 'HO-SS-03', text: 'Eggs carton stock ledu bro, asked worker and he said no stock today.', expected: 'STOCK_SHORTAGE', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-SS-04', text: 'Ration rice bags stock aipoyindi, when will you restock again?', expected: 'STOCK_SHORTAGE', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-SS-05', text: 'Every time I visit on weekends all popular bread items are unavailable.', expected: 'STOCK_SHORTAGE', lang: 'en', type: 'standard' },
  { id: 'HO-SS-06', text: 'Sugar packets dhorakatledu counters daggara, shelves khali ga unnai.', expected: 'STOCK_SHORTAGE', lang: 'te-en', type: 'code_mixed' },

  // 2. BILLING_DELAY (6 samples)
  { id: 'HO-BD-01', text: 'Had to wait for 25 minutes in the queue because only one cashier was active.', expected: 'BILLING_DELAY', lang: 'en', type: 'standard' },
  { id: 'HO-BD-02', text: 'Billing counter daggara chala delay undi, billing counter chala slow ga chestunnaru.', expected: 'BILLING_DELAY', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-BD-03', text: 'Checkout process is terribly slow, line peddaga undi till exit gate.', expected: 'BILLING_DELAY', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-BD-04', text: 'The cashier took 15 minutes just for 4 items, long queues everywhere.', expected: 'BILLING_DELAY', lang: 'en', type: 'standard' },
  { id: 'HO-BD-05', text: 'Billing counter speed is awful during peak evening hours, huge crowd waiting.', expected: 'BILLING_DELAY', lang: 'en', type: 'standard' },
  { id: 'HO-BD-06', text: 'Cashier slow ga bill chesthunnaru, line lo nunchoni chala sepu aindi.', expected: 'BILLING_DELAY', lang: 'te-en', type: 'code_mixed' },

  // 3. STAFF_BEHAVIOUR (6 samples)
  { id: 'HO-SB-01', text: 'The floor manager was extremely rude and unhelpful when asked about aisle directions.', expected: 'STAFF_BEHAVIOUR', lang: 'en', type: 'standard' },
  { id: 'HO-SB-02', text: 'Cashier screamed at an elderly lady for asking price clarification.', expected: 'STAFF_BEHAVIOUR', lang: 'en', type: 'standard' },
  { id: 'HO-SB-03', text: 'Staff members were shouting at each other and ignoring customer questions.', expected: 'STAFF_BEHAVIOUR', lang: 'en', type: 'standard' },
  { id: 'HO-SB-04', text: 'Store staff mariadaga matladaledu, chala arrogant behavior chupincharu.', expected: 'STAFF_BEHAVIOUR', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-SB-05', text: 'Security guard was very aggressive while checking bags at the door.', expected: 'STAFF_BEHAVIOUR', lang: 'en', type: 'standard' },
  { id: 'HO-SB-06', text: 'Cashier threw change coins on table, staff rude ga behave chesaru.', expected: 'STAFF_BEHAVIOUR', lang: 'te-en', type: 'code_mixed' },

  // 4. PRODUCT_QUALITY (6 samples)
  { id: 'HO-PRODUCT-01', text: 'Purchased a curd packet that smelled sour and had expired date.', expected: 'PRODUCT_QUALITY', lang: 'en', type: 'standard' },
  { id: 'HO-PRODUCT-02', text: 'The mangoes in fruit section were completely rotten with white worms inside.', expected: 'PRODUCT_QUALITY', lang: 'en', type: 'standard' },
  { id: 'HO-PRODUCT-03', text: 'Bread pack lo mold vachindi, expiry date datipoyindi already.', expected: 'PRODUCT_QUALITY', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-PRODUCT-04', text: 'Milk packet opened at home was stale and curdled, quality bagoledhu.', expected: 'PRODUCT_QUALITY', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-PRODUCT-05', text: 'Wheat flour packet was damaged and powder was leaking all over the trolley.', expected: 'PRODUCT_QUALITY', lang: 'en', type: 'standard' },
  { id: 'HO-PRODUCT-06', text: 'Bought biscuits packet yesterday, completely soggy and spoiled food.', expected: 'PRODUCT_QUALITY', lang: 'en', type: 'standard' },

  // 5. EQUIPMENT_FAILURE (6 samples)
  { id: 'HO-EF-01', text: 'Main central AC not working in produce section, sweating intensely.', expected: 'EQUIPMENT_FAILURE', lang: 'en', type: 'standard' },
  { id: 'HO-EF-02', text: 'The barcode scanner broke down and cashier had to punch codes by hand.', expected: 'EQUIPMENT_FAILURE', lang: 'en', type: 'standard' },
  { id: 'HO-EF-03', text: 'Deep freezer broken and ice cream tubs were melting into liquid soup.', expected: 'EQUIPMENT_FAILURE', lang: 'en', type: 'standard' },
  { id: 'HO-EF-04', text: 'Trolley wheel is broken, impossible to push down the aisle.', expected: 'EQUIPMENT_FAILURE', lang: 'en', type: 'standard' },
  { id: 'HO-EF-05', text: 'Card machine not working and UPI was failing too, payment terminal failure.', expected: 'EQUIPMENT_FAILURE', lang: 'en', type: 'standard' },
  { id: 'HO-EF-06', text: 'Store lo AC pani cheyatledu, refrigerator cooling ledu food warm ga aindi.', expected: 'EQUIPMENT_FAILURE', lang: 'te-en', type: 'code_mixed' },

  // 6. OTHER (6 samples)
  { id: 'HO-OTHER-01', text: 'Parking space is completely jammed on Saturday evenings, need valet or parking lot attendant.', expected: 'OTHER', lang: 'en', type: 'standard' },
  { id: 'HO-OTHER-02', text: 'Store timings should be extended till 11 PM on festivals for working professionals.', expected: 'OTHER', lang: 'en', type: 'standard' },
  { id: 'HO-OTHER-03', text: 'Customer washroom was filthy and had no water in the tap.', expected: 'OTHER', lang: 'en', type: 'standard' },
  { id: 'HO-OTHER-04', text: 'Store music was way too loud and obnoxious, lighting too dim.', expected: 'OTHER', lang: 'en', type: 'standard' },
  { id: 'HO-OTHER-05', text: 'Parking space ledu car park cheyadaniki, chala kashtam aindi.', expected: 'OTHER', lang: 'te-en', type: 'code_mixed' },
  { id: 'HO-OTHER-06', text: 'Prices are heavily overpriced compared to local supermarket down the road.', expected: 'OTHER', lang: 'en', type: 'standard' },

  // 7. NEEDS_REVIEW (Conflicts, Ambiguity, Low-Confidence, Gibberish) (6 samples)
  { id: 'HO-NR-01', text: 'Cashier was extremely rude and the milk packet was completely expired and rotten.', expected: 'NEEDS_REVIEW', lang: 'en', type: 'conflict' },
  { id: 'HO-NR-02', text: 'Billing counter is slow and also AC is broken and ice cream is melting.', expected: 'NEEDS_REVIEW', lang: 'en', type: 'conflict' },
  { id: 'HO-NR-03', text: 'Nice weather outside today, just came to walk around.', expected: 'NEEDS_REVIEW', lang: 'en', type: 'unrelated' },
  { id: 'HO-NR-04', text: 'okay okay store not bad', expected: 'NEEDS_REVIEW', lang: 'en', type: 'ambiguous' },
  { id: 'HO-NR-05', text: 'asdfghjkl qwerty 12345', expected: 'NEEDS_REVIEW', lang: 'en', type: 'gibberish' },
  { id: 'HO-NR-06', text: 'Bagundi kani em cheppali telitledu', expected: 'NEEDS_REVIEW', lang: 'te-en', type: 'vague' },
];

async function runEvaluation() {
  console.log('======================================================================');
  console.log('  StoreGrid NLP Independent Held-Out Evaluation Benchmark');
  console.log(`  Evaluating against FastAPI Service at: ${NLP_URL}`);
  console.log(`  Total Held-Out Samples: ${HELD_OUT_DATASET.length}`);
  console.log('======================================================================\n');

  const categories = [
    'STOCK_SHORTAGE',
    'BILLING_DELAY',
    'STAFF_BEHAVIOUR',
    'PRODUCT_QUALITY',
    'EQUIPMENT_FAILURE',
    'OTHER',
    'NEEDS_REVIEW',
  ];

  const confusionMatrix = {};
  for (const c1 of categories) {
    confusionMatrix[c1] = {};
    for (const c2 of categories) {
      confusionMatrix[c1][c2] = 0;
    }
  }

  const results = [];
  let correctCount = 0;
  let codeMixedCount = 0;
  let codeMixedCorrect = 0;

  for (const sample of HELD_OUT_DATASET) {
    const payload = {
      feedbackId: sample.id,
      storeId: 'STR-HYD-001',
      text: sample.text,
      sourceType: 'CUSTOMER_REVIEW',
      language: sample.lang,
    };

    let predicted = 'NEEDS_REVIEW';
    let confidence = 0.0;
    let matchedTerms = [];

    try {
      const res = await fetch(`${NLP_URL}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        predicted = data.category;
        confidence = data.confidence;
        matchedTerms = data.matchedTerms || [];
      } else {
        console.error(`HTTP error ${res.status} for ${sample.id}`);
      }
    } catch (err) {
      console.error(`Connection error for ${sample.id}:`, err.message);
    }

    const isCorrect = predicted === sample.expected;
    if (isCorrect) correctCount++;

    if (sample.lang === 'te-en') {
      codeMixedCount++;
      if (isCorrect) codeMixedCorrect++;
    }

    if (confusionMatrix[sample.expected] && confusionMatrix[sample.expected][predicted] !== undefined) {
      confusionMatrix[sample.expected][predicted]++;
    }

    results.push({
      id: sample.id,
      type: sample.type,
      language: sample.lang,
      expected: sample.expected,
      predicted,
      confidence,
      matchedTerms,
      isCorrect,
      text: sample.text,
    });
  }

  // Calculate per-category precision, recall, F1
  const categoryMetrics = {};
  let macroPrecision = 0;
  let macroRecall = 0;
  let macroF1 = 0;

  for (const cat of categories) {
    let tp = confusionMatrix[cat][cat];
    let fp = 0;
    let fn = 0;

    for (const other of categories) {
      if (other !== cat) {
        fp += confusionMatrix[other][cat];
        fn += confusionMatrix[cat][other];
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    categoryMetrics[cat] = {
      support: tp + fn,
      tp,
      fp,
      fn,
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
      f1: Number(f1.toFixed(3)),
    };

    macroPrecision += precision;
    macroRecall += recall;
    macroF1 += f1;
  }

  const overallAccuracy = correctCount / HELD_OUT_DATASET.length;
  macroPrecision /= categories.length;
  macroRecall /= categories.length;
  macroF1 /= categories.length;

  const codeMixedAccuracy = codeMixedCount > 0 ? codeMixedCorrect / codeMixedCount : 0;

  console.log('--- PER-CATEGORY PERFORMANCE SUMMARY ---');
  console.table(categoryMetrics);

  console.log('\n--- OVERALL BENCHMARK RESULTS ---');
  console.log(`Total Samples:           ${HELD_OUT_DATASET.length}`);
  console.log(`Overall Accuracy:        ${(overallAccuracy * 100).toFixed(1)}% (${correctCount}/${HELD_OUT_DATASET.length})`);
  console.log(`Telugu-English Accuracy: ${(codeMixedAccuracy * 100).toFixed(1)}% (${codeMixedCorrect}/${codeMixedCount})`);
  console.log(`Macro Precision:         ${macroPrecision.toFixed(3)}`);
  console.log(`Macro Recall:            ${macroRecall.toFixed(3)}`);
  console.log(`Macro F1-Score:          ${macroF1.toFixed(3)}\n`);

  console.log('--- CONFUSION MATRIX (Row = Expected, Col = Predicted) ---');
  console.table(confusionMatrix);

  const errors = results.filter((r) => !r.isCorrect);
  if (errors.length > 0) {
    console.log('\n--- MISCLASSIFIED SAMPLES ---');
    errors.forEach((err) => {
      console.log(`[FAIL] ${err.id} (${err.language}, ${err.type}):`);
      console.log(`  Text:      "${err.text}"`);
      console.log(`  Expected:  ${err.expected}`);
      console.log(`  Predicted: ${err.predicted} (Confidence: ${err.confidence})`);
      console.log(`  Matched:   ${JSON.stringify(err.matchedTerms)}`);
    });
  } else {
    console.log('\nAll 42 held-out evaluation samples classified with 100% agreement!');
  }

  // Save report artifact for final reporting
  const evaluationReport = {
    evaluatedAt: new Date().toISOString(),
    serviceUrl: NLP_URL,
    totalSamples: HELD_OUT_DATASET.length,
    accuracy: Number(overallAccuracy.toFixed(4)),
    accuracyPercent: `${(overallAccuracy * 100).toFixed(1)}%`,
    codeMixedAccuracy: Number(codeMixedAccuracy.toFixed(4)),
    codeMixedAccuracyPercent: `${(codeMixedAccuracy * 100).toFixed(1)}%`,
    macroPrecision: Number(macroPrecision.toFixed(4)),
    macroRecall: Number(macroRecall.toFixed(4)),
    macroF1: Number(macroF1.toFixed(4)),
    categoryMetrics,
    confusionMatrix,
    errors,
  };

  const outDir = path.join(__dirname, '../data/qa');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'nlp_held_out_benchmark.json'), JSON.stringify(evaluationReport, null, 2));
  console.log(`\nEvaluation report saved to data/qa/nlp_held_out_benchmark.json`);

  return evaluationReport;
}

if (require.main === module) {
  runEvaluation().then(() => process.exit(0)).catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runEvaluation, HELD_OUT_DATASET };
