import { pgTable, serial, varchar, text, timestamp, doublePrecision, integer } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // 'MASTER' or 'CLIENT'
  name: varchar('name', { length: 255 }),
  clientId: integer('client_id').references(() => clients.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cokeDrums = pgTable('coke_drums', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  diameter: doublePrecision('diameter'),
  nominalThickness: doublePrecision('nominal_thickness'),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const weldJoints = pgTable('weld_joints', {
  id: serial('id').primaryKey(),
  drumId: integer('drum_id').references(() => cokeDrums.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  referenceDistance: doublePrecision('reference_distance'),
  configuration: text('configuration'),
});
