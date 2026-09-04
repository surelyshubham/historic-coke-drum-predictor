import { db } from './index';
import { 
  users, 
  clients, 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches, 
  repairEvents, 
  auditLogs 
} from './schema';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Seeding database with authentic refinery PAUT dataset (R01, R02)...');
  
  // Clear existing records in reverse dependency order
  await db.delete(auditLogs);
  await db.delete(repairEvents);
  await db.delete(indicationMatches);
  await db.delete(physicalIndications);
  await db.delete(inspectionObservations);
  await db.delete(inspections);
  await db.delete(weldJoints);
  await db.delete(users);
  await db.delete(cokeDrums);
  await db.delete(clients);

  // 1. Create Refinery Client
  const [client] = await db.insert(clients).values({
    name: 'Refinery Alpha (Delayed Coking Unit)',
    description: 'Primary Industrial Client for Coke Drum PAUT Monitoring',
  }).returning();

  // 2. Create Master & Client Users
  const masterPassword = await bcrypt.hash('master123', 10);
  const clientPassword = await bcrypt.hash('client123', 10);

  const [masterUser] = await db.insert(users).values({
    email: 'master@demo.com',
    passwordHash: masterPassword,
    role: 'MASTER',
    name: 'Master Engineer',
  }).returning();

  await db.insert(users).values({
    email: 'client@demo.com',
    passwordHash: clientPassword,
    role: 'CLIENT',
    name: 'Alpha Plant Inspector',
    clientId: client.id,
  });

  // 3. Create Authentic Coke Drums R01 and R02 from Excel
  const [drumR01] = await db.insert(cokeDrums).values({
    clientId: client.id,
    name: 'R01',
    description: 'Delayed Coking Unit Coke Drum R01',
    diameter: 8.97, // 8.97 meters (~28.18 m circumference)
    nominalThickness: 32.0, // 32 mm nominal wall
    material: 'SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)',
    status: 'active',
  }).returning();

  const [drumR02] = await db.insert(cokeDrums).values({
    clientId: client.id,
    name: 'R02',
    description: 'Delayed Coking Unit Coke Drum R02',
    diameter: 8.97,
    nominalThickness: 32.0,
    material: 'SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)',
    status: 'active',
  }).returning();

  // Legacy Drum C04
  const [drumC04] = await db.insert(cokeDrums).values({
    clientId: client.id,
    name: 'C04',
    description: 'Main Delayed Coking Unit Drum C04',
    diameter: 8.0,
    nominalThickness: 32.0,
    material: 'SA-387 Grade 22 Class 2',
    status: 'active',
  }).returning();

  // 4. Create Weld Joints
  const [r01C4] = await db.insert(weldJoints).values({ drumId: drumR01.id, name: 'C4', referenceDistance: 12000 }).returning();
  const [r01C6] = await db.insert(weldJoints).values({ drumId: drumR01.id, name: 'C6', referenceDistance: 18000 }).returning();
  const [r02C6] = await db.insert(weldJoints).values({ drumId: drumR02.id, name: 'C6', referenceDistance: 18000 }).returning();
  const [c04W01] = await db.insert(weldJoints).values({ drumId: drumC04.id, name: 'W01', referenceDistance: 0 }).returning();

  // 5. Create Inspection Campaigns for R01
  const campaigns = [
    { key: 'OCT-23', label: 'OCT-23 Campaign', date: new Date('2023-10-15') },
    { key: 'APR-24', label: 'APRIL-24 Campaign', date: new Date('2024-04-15') },
    { key: 'SEP-24', label: 'SEP-24 Campaign', date: new Date('2024-09-15') },
    { key: 'MAY-25', label: 'MAY-25 Campaign', date: new Date('2025-05-15') },
    { key: 'FEB-26', label: 'FEB-2026 Campaign', date: new Date('2026-02-15') },
    { key: 'MAY-26', label: 'MAY-2026 Campaign', date: new Date('2026-05-15') },
  ];

  const r01Inspections = new Map<string, number>();
  for (const c of campaigns) {
    const [insp] = await db.insert(inspections).values({
      drumId: drumR01.id,
      inspectionDate: c.date,
      campaignName: c.label,
      inspectionType: 'PAUT/DRM Matrix',
      processingStatus: 'COMPLETED',
      validationStatus: 'VALIDATED',
      createdBy: masterUser.id,
    }).returning();
    r01Inspections.set(c.key, insp.id);
  }

  // Also create for R02
  const r02Inspections = new Map<string, number>();
  for (const c of campaigns) {
    const [insp] = await db.insert(inspections).values({
      drumId: drumR02.id,
      inspectionDate: c.date,
      campaignName: c.label,
      inspectionType: 'PAUT/DRM Matrix',
      processingStatus: 'COMPLETED',
      validationStatus: 'VALIDATED',
      createdBy: masterUser.id,
    }).returning();
    r02Inspections.set(c.key, insp.id);
  }

  // 6. Create Persistent Physical Indications from Excel Sheet
  // R01 Indication 1: C6 7400-8400 mm
  const [r01Pi1] = await db.insert(physicalIndications).values({
    code: 'PI-R01-C6-7400',
    drumId: drumR01.id,
    weldJointId: r01C6.id,
    approximateLocation: 7400,
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 1000.0,
    currentDepth: 4.5,
    status: 'ACTIVE',
    matchingConfidence: 0.98,
    notes: 'Segment 6-9 | 30MM BT (Bottom Toe)',
  }).returning();

  // R01 Indication 2: C6 9860-10000 mm
  const [r01Pi2] = await db.insert(physicalIndications).values({
    code: 'PI-R01-C6-9860',
    drumId: drumR01.id,
    weldJointId: r01C6.id,
    approximateLocation: 9860,
    firstObservedDate: new Date('2024-04-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 140.0,
    currentDepth: 3.2,
    status: 'ACTIVE',
    matchingConfidence: 0.98,
    notes: 'Segment 9-12 | 30MM BT',
  }).returning();

  // R01 Indication 3: C6 10335-10430 mm
  const [r01Pi3] = await db.insert(physicalIndications).values({
    code: 'PI-R01-C6-10335',
    drumId: drumR01.id,
    weldJointId: r01C6.id,
    approximateLocation: 10335,
    firstObservedDate: new Date('2024-04-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 95.0,
    currentDepth: 2.8,
    status: 'ACTIVE',
    matchingConfidence: 0.98,
    notes: 'Segment 9-12 | 30MM BT',
  }).returning();

  // R01 Indication 4: C4 12500 mm (Critical Indication)
  const [r01Pi4] = await db.insert(physicalIndications).values({
    code: 'PI-R01-C4-12500',
    drumId: drumR01.id,
    weldJointId: r01C4.id,
    approximateLocation: 12500,
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 1850.0,
    currentDepth: 26.8, // 83.8% wall loss -> HIGH / WARNING RISK
    status: 'ACTIVE',
    matchingConfidence: 0.99,
    notes: 'Segment 12-15 | Weld Centerline Crack',
  }).returning();

  // R02 Indication 1: C6 7300-7470 mm
  const [r02Pi1] = await db.insert(physicalIndications).values({
    code: 'PI-R02-C6-7300',
    drumId: drumR02.id,
    weldJointId: r02C6.id,
    approximateLocation: 7300,
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 170.0,
    currentDepth: 3.0,
    status: 'ACTIVE',
    matchingConfidence: 0.98,
    notes: 'Segment 6-9 | 35MM BT',
  }).returning();

  // R02 Indication 2: C6 12000-15000 mm (Long flaw 3000 mm)
  const [r02Pi2] = await db.insert(physicalIndications).values({
    code: 'PI-R02-C6-12000',
    drumId: drumR02.id,
    weldJointId: r02C6.id,
    approximateLocation: 12000,
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2026-05-15'),
    currentLength: 3000.0,
    currentDepth: 4.8,
    status: 'ACTIVE',
    matchingConfidence: 0.99,
    notes: 'Segment 12-15 | 35MM BT (Major weld flaw 3 meters long)',
  }).returning();

  // 7. Insert Historical Multi-Campaign Observations for R01 Flaws
  // Observations for PI-R01-C6-7400
  const r01Pi1Obs = [
    { camp: 'OCT-23', len: 600, dep: 2.0 },
    { camp: 'APR-24', len: 650, dep: 2.5 },
    { camp: 'SEP-24', len: 950, dep: 3.2 },
    { camp: 'MAY-25', len: 1000, dep: 3.8 },
    { camp: 'FEB-26', len: 1000, dep: 4.2 },
    { camp: 'MAY-26', len: 1000, dep: 4.5 },
  ];
  for (const o of r01Pi1Obs) {
    const inspId = r01Inspections.get(o.camp)!;
    const [obs] = await db.insert(inspectionObservations).values({
      inspectionId: inspId,
      sourceIndicationNumber: 'IND-7400',
      weldJointId: r01C6.id,
      circumferentialPosition: 7400,
      length: o.len,
      depth: o.dep,
      indicationType: 'Crack-like',
      rawSourceData: { 'SEGMENT [M]': '6-9' },
    }).returning();

    await db.insert(indicationMatches).values({
      physicalIndicationId: r01Pi1.id,
      observationId: obs.id,
      confidenceScore: 0.99,
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
    });
  }

  // Observations for PI-R01-C6-9860
  const r01Pi2Obs = [
    { camp: 'APR-24', len: 100, dep: 1.8 },
    { camp: 'SEP-24', len: 130, dep: 2.4 },
    { camp: 'MAY-25', len: 140, dep: 2.8 },
    { camp: 'FEB-26', len: 140, dep: 3.0 },
    { camp: 'MAY-26', len: 140, dep: 3.2 },
  ];
  for (const o of r01Pi2Obs) {
    const inspId = r01Inspections.get(o.camp)!;
    const [obs] = await db.insert(inspectionObservations).values({
      inspectionId: inspId,
      sourceIndicationNumber: 'IND-9860',
      weldJointId: r01C6.id,
      circumferentialPosition: 9860,
      length: o.len,
      depth: o.dep,
      indicationType: 'Crack-like',
      rawSourceData: { 'SEGMENT [M]': '9-12' },
    }).returning();

    await db.insert(indicationMatches).values({
      physicalIndicationId: r01Pi2.id,
      observationId: obs.id,
      confidenceScore: 0.98,
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
    });
  }

  // Observations for PI-R01-C4-12500 (Critical High Risk)
  const r01Pi4Obs = [
    { camp: 'OCT-23', len: 1200, dep: 18.0 },
    { camp: 'APR-24', len: 1400, dep: 20.5 },
    { camp: 'SEP-24', len: 1600, dep: 23.0 },
    { camp: 'MAY-25', len: 1750, dep: 25.2 },
    { camp: 'MAY-26', len: 1850, dep: 26.8 },
  ];
  for (const o of r01Pi4Obs) {
    const inspId = r01Inspections.get(o.camp)!;
    const [obs] = await db.insert(inspectionObservations).values({
      inspectionId: inspId,
      sourceIndicationNumber: 'IND-12500',
      weldJointId: r01C4.id,
      circumferentialPosition: 12500,
      length: o.len,
      depth: o.dep,
      indicationType: 'Crack-like',
      rawSourceData: { 'SEGMENT [M]': '12-15' },
    }).returning();

    await db.insert(indicationMatches).values({
      physicalIndicationId: r01Pi4.id,
      observationId: obs.id,
      confidenceScore: 0.99,
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
    });
  }

  // Observations for R02 Flaws
  const r02Pi2Obs = [
    { camp: 'OCT-23', len: 3000, dep: 3.5 },
    { camp: 'APR-24', len: 3000, dep: 3.8 },
    { camp: 'SEP-24', len: 3000, dep: 4.2 },
    { camp: 'MAY-25', len: 3000, dep: 4.5 },
    { camp: 'MAY-26', len: 3000, dep: 4.8 },
  ];
  for (const o of r02Pi2Obs) {
    const inspId = r02Inspections.get(o.camp)!;
    const [obs] = await db.insert(inspectionObservations).values({
      inspectionId: inspId,
      sourceIndicationNumber: 'IND-12000',
      weldJointId: r02C6.id,
      circumferentialPosition: 12000,
      length: o.len,
      depth: o.dep,
      indicationType: 'Crack-like',
      rawSourceData: { 'SEGMENT [M]': '12-15' },
    }).returning();

    await db.insert(indicationMatches).values({
      physicalIndicationId: r02Pi2.id,
      observationId: obs.id,
      confidenceScore: 0.99,
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
    });
  }

  console.log('Database successfully seeded with authentic R01, R02 datasets and multi-campaign timelines.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Failed to seed database:', err);
  process.exit(1);
});
