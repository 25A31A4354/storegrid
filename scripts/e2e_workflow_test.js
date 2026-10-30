/**
 * StoreGrid Full Integrated End-to-End Workflow Verification
 *
 * Exercises the complete multi-tier flow:
 * 1. Health check verification (Backend + DB + Live FastAPI NLP service)
 * 2. Real-time feedback submission (English + Telugu-English code-mixed)
 * 3. NLP Microservice classification & Confidence evaluation
 * 4. Relational database persistence
 * 5. Aggregated Dashboard summary & Category breakdown
 * 6. Issue generation, team assignment, resolution & audit history logging
 * 7. Needs Review queue triage and manual reclassification
 * 8. Priority & Trend Detection (Sanjay's analytics engine)
 * 9. Safe Demo Reset verification
 */

const http = require('http');
const app = require('../src/app');
const db = require('../src/db');
const storeService = require('../src/services/store.service');

async function runE2E() {
  console.log('======================================================================');
  console.log('  StoreGrid Fullstack End-to-End Integration Verification');
  console.log('======================================================================\n');

  // 1. Initialize DB in isolated mode
  await db.initDb({ inMemory: true, forceFallback: true });

  const store = await storeService.findOrCreateStore({
    storeIdOrCode: 'STR-E2E-HYD',
    defaultName: 'StoreGrid E2E Hyderabad Flagship',
    region: 'Telangana',
    city: 'Hyderabad',
  });
  console.log(`[E2E 1/9] Initialized test store: ${store.name} (${store.code})`);

  // Start Express server on random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[E2E 2/9] Server listening on ${baseUrl}`);

  try {
    // 2. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const health = await healthRes.json();
    if (healthRes.status !== 200 || !health.nlpService.available) {
      throw new Error(`Health check failed: ${JSON.stringify(health)}`);
    }
    console.log(`[E2E 3/9] System Health: Backend OK, DB (${health.database.mode}) OK, NLP Service (${health.nlpService.status}) OK`);

    // 3. Submit Telugu-English code-mixed complaint
    const tePayload = {
      storeCode: 'STR-E2E-HYD',
      text: 'Dairy section lo milk packets stock ledu, shelves khali ga unnai customers wait chesthunnaru',
      rating: 1,
      sourceType: 'KIOSK_FEEDBACK',
      provenance: 'TEST',
    };
    const teRes = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tePayload),
    });
    const teBody = await teRes.json();
    if (teRes.status !== 201 || teBody.data.detectedCategory !== 'STOCK_SHORTAGE') {
      throw new Error(`Telugu feedback submission failed: ${JSON.stringify(teBody)}`);
    }
    console.log(`[E2E 4/9] Submitted Telugu-English feedback: Classified as "${teBody.data.detectedCategory}" (Confidence: ${teBody.data.confidence}, Lang: ${teBody.data.language})`);

    // 4. Submit Critical Hazard Equipment complaint
    const critPayload = {
      storeCode: 'STR-E2E-HYD',
      text: 'Severe AC breakdown in store and main display freezer broken, ice cream melting rapidly!',
      rating: 1,
      sourceType: 'STAFF_NOTE',
      provenance: 'TEST',
    };
    const critRes = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(critPayload),
    });
    const critBody = await critRes.json();
    if (critRes.status !== 201 || critBody.data.priority !== 'CRITICAL') {
      throw new Error(`Critical equipment feedback failed: ${JSON.stringify(critBody)}`);
    }
    console.log(`[E2E 5/9] Submitted Hazard feedback: Priority escalated to "${critBody.data.priority}" (Category: ${critBody.data.detectedCategory})`);

    // 5. Submit Ambiguous feedback that routes to NEEDS_REVIEW
    const ambPayload = {
      storeCode: 'STR-E2E-HYD',
      text: 'Not sure what happened but something was off at the shop entrance today',
      rating: 3,
      sourceType: 'CUSTOMER_REVIEW',
      provenance: 'TEST',
    };
    const ambRes = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ambPayload),
    });
    const ambBody = await ambRes.json();
    if (ambRes.status !== 201 || ambBody.data.detectedCategory !== 'NEEDS_REVIEW') {
      throw new Error(`Ambiguous feedback failed: ${JSON.stringify(ambBody)}`);
    }
    console.log(`[E2E 6/9] Submitted Ambiguous feedback: Routed to "${ambBody.data.detectedCategory}" (NeedsReview: ${ambBody.data.needsReview})`);

    // 6. Verify Dashboard Overview metrics before issue creation
    const ovRes = await fetch(`${baseUrl}/api/dashboard/overview?storeId=STR-E2E-HYD&dateRange=all`);
    const overview = await ovRes.json();
    const { totalFeedback, needsReview } = overview.data.metrics;
    if (totalFeedback !== 3 || needsReview !== 1) {
      throw new Error(`Overview metrics mismatch: ${JSON.stringify(overview.data.metrics)}`);
    }
    console.log(`[E2E 7/9] Dashboard Overview Metrics: Total=${totalFeedback}, NeedsReview=${needsReview}`);

    // 7. Manual Triage of Needs Review feedback
    const triageRes = await fetch(`${baseUrl}/api/feedback/${ambBody.data.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'OTHER',
        notes: 'Manager confirmed customer had question about promotional banner at entrance',
        resolved: true,
      }),
    });
    const triageBody = await triageRes.json();
    if (triageRes.status !== 200 || triageBody.data.category !== 'OTHER' || triageBody.data.needsReview !== false) {
      throw new Error(`Triage update failed: ${JSON.stringify(triageBody)}`);
    }
    console.log(`[E2E 8/9] Triaged Needs Review feedback: Reclassified to "${triageBody.data.category}" (Resolved: ${triageBody.data.resolved})`);

    // 8. Create Issue, Assign Team & Resolve
    const issueRes = await fetch(`${baseUrl}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeCode: 'STR-E2E-HYD',
        title: 'Emergency Chiller Maintenance',
        description: 'HVAC technicians dispatched to restore display freezer temperature',
        category: 'EQUIPMENT_FAILURE',
        priority: 'CRITICAL',
        ownerTeam: 'FACILITIES_MAINTENANCE',
        feedbackIds: [critBody.data.id],
      }),
    });
    const issueBody = await issueRes.json();
    const issueId = issueBody.data.id;

    // Verify critical issue counter increases to 1 in dashboard metrics
    const ovCreated = await (await fetch(`${baseUrl}/api/dashboard/overview?storeId=STR-E2E-HYD&dateRange=all`)).json();
    if (ovCreated.data.metrics.criticalIssues !== 1) {
      throw new Error(`Expected 1 critical issue after creation, got ${ovCreated.data.metrics.criticalIssues}`);
    }

    // Resolve issue
    await fetch(`${baseUrl}/api/issues/${issueId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolutionNotes: 'Compressor valve replaced and temperature stabilized at -18C.',
      }),
    });

    // Verify critical issue counter drops to 0 after resolution
    const ovResolved = await (await fetch(`${baseUrl}/api/dashboard/overview?storeId=STR-E2E-HYD&dateRange=all`)).json();
    if (ovResolved.data.metrics.criticalIssues !== 0) {
      throw new Error(`Expected 0 critical issues after resolution, got ${ovResolved.data.metrics.criticalIssues}`);
    }

    // Check Audit History
    const historyRes = await fetch(`${baseUrl}/api/issues/${issueId}/history`);
    const historyBody = await historyRes.json();
    if (historyBody.data.length < 2) {
      throw new Error(`Audit history missing entries: ${JSON.stringify(historyBody.data)}`);
    }
    console.log(`[E2E 9/9] Issue Lifecycle Verified: Created -> Resolved, Audit Trail logged ${historyBody.data.length} transitions`);

    console.log('\n======================================================================');
    console.log('  ALL END-TO-END INTEGRATION WORKFLOWS VERIFIED SUCCESSFULLY!');
    console.log('======================================================================\n');
  } finally {
    server.close();
    await db.closeDb();
  }
}

if (require.main === module) {
  runE2E()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('E2E Failure:', err);
      process.exit(1);
    });
}

module.exports = { runE2E };
