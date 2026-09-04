import { db } from './index';
import { users, clients, cokeDrums, weldJoints } from './schema';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Seeding database...');
  
  // Create Client
  const [client] = await db.insert(clients).values({
    name: 'Client A',
    description: 'Demo Client A',
  }).returning();

  // Create Users
  const masterPassword = await bcrypt.hash('master123', 10);
  const clientPassword = await bcrypt.hash('client123', 10);

  await db.insert(users).values([
    {
      email: 'master@demo.com',
      passwordHash: masterPassword,
      role: 'MASTER',
      name: 'Master Admin',
    },
    {
      email: 'client@demo.com',
      passwordHash: clientPassword,
      role: 'CLIENT',
      name: 'Client User',
      clientId: client.id,
    }
  ]);

  // Create Coke Drum
  const [drum] = await db.insert(cokeDrums).values({
    clientId: client.id,
    name: 'C04',
    description: 'Coke Drum C04',
    diameter: 8000,
    nominalThickness: 32,
  }).returning();

  // Create Welds
  await db.insert(weldJoints).values([
    { drumId: drum.id, name: 'W01', referenceDistance: 0 },
    { drumId: drum.id, name: 'W02', referenceDistance: 2500 },
    { drumId: drum.id, name: 'W03', referenceDistance: 5000 },
  ]);

  console.log('Database seeded successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Failed to seed', err);
  process.exit(1);
});
