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

  console.log('Database successfully initialized with clean user accounts. Vessel and weld data will be populated dynamically from uploaded Excel matrices.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Failed to seed database:', err);
  process.exit(1);
});
