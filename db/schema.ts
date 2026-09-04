import { pgTable, serial, varchar, text, timestamp, doublePrecision, integer, jsonb } from 'drizzle-orm/pg-core';

// 1. Clients
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Users & Roles
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // 'MASTER' or 'CLIENT'
  name: varchar('name', { length: 255 }),
  clientId: integer('client_id').references(() => clients.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Coke Drums
export const cokeDrums = pgTable('coke_drums', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  diameter: doublePrecision('diameter'),
  nominalThickness: doublePrecision('nominal_thickness'),
  material: varchar('material', { length: 255 }),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Weld Joints
export const weldJoints = pgTable('weld_joints', {
  id: serial('id').primaryKey(),
  drumId: integer('drum_id').references(() => cokeDrums.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  referenceDistance: doublePrecision('reference_distance'),
  configuration: text('configuration'),
});

// 5. Inspections
export const inspections = pgTable('inspections', {
  id: serial('id').primaryKey(),
  drumId: integer('drum_id').references(() => cokeDrums.id).notNull(),
  inspectionDate: timestamp('inspection_date').notNull(),
  campaignName: varchar('campaign_name', { length: 255 }).notNull(),
  inspectionType: varchar('inspection_type', { length: 100 }).default('PAUT/DRM'),
  processingStatus: varchar('processing_status', { length: 50 }).default('COMPLETED'), // PENDING, PROCESSING, COMPLETED, FAILED
  validationStatus: varchar('validation_status', { length: 50 }).default('VALIDATED'), // VALIDATED, NEEDS_REVIEW, INVALID
  notes: text('notes'),
  sourceInfo: text('source_info'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Inspection Files (File Storage Metadata)
export const inspectionFiles = pgTable('inspection_files', {
  id: serial('id').primaryKey(),
  inspectionId: integer('inspection_id').references(() => inspections.id).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  objectKey: varchar('object_key', { length: 512 }).notNull(),
  checksum: varchar('checksum', { length: 128 }),
  sizeBytes: integer('size_bytes'),
  mimeType: varchar('mime_type', { length: 100 }),
  status: varchar('status', { length: 50 }).default('UPLOADED'),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

// 7. Inspection Observations (Single Inspection Measurements)
export const inspectionObservations = pgTable('inspection_observations', {
  id: serial('id').primaryKey(),
  inspectionId: integer('inspection_id').references(() => inspections.id).notNull(),
  sourceIndicationNumber: varchar('source_indication_number', { length: 100 }),
  weldJointId: integer('weld_joint_id').references(() => weldJoints.id).notNull(),
  scanReference: doublePrecision('scan_reference'),
  circumferentialPosition: doublePrecision('circumferential_position'),
  axialPosition: doublePrecision('axial_position'),
  length: doublePrecision('length').notNull(), // mm
  depth: doublePrecision('depth').notNull(), // mm
  amplitude: doublePrecision('amplitude'),
  da: doublePrecision('da'),
  pa: doublePrecision('pa'),
  sa: doublePrecision('sa'),
  smR: doublePrecision('sm_r'),
  umR: doublePrecision('um_r'),
  imR: doublePrecision('im_r'),
  indicationType: varchar('indication_type', { length: 100 }),
  result: varchar('result', { length: 100 }),
  rawSourceData: jsonb('raw_source_data'),
  normalizedValues: jsonb('normalized_values'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Physical Indications (Persistent physical defect entity across campaigns)
export const physicalIndications = pgTable('physical_indications', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(), // e.g. PI-000001
  drumId: integer('drum_id').references(() => cokeDrums.id).notNull(),
  weldJointId: integer('weld_joint_id').references(() => weldJoints.id).notNull(),
  approximateLocation: doublePrecision('approximate_location'),
  firstObservedDate: timestamp('first_observed_date'),
  latestObservedDate: timestamp('latest_observed_date'),
  currentLength: doublePrecision('current_length'),
  currentDepth: doublePrecision('current_depth'),
  status: varchar('status', { length: 50 }).default('ACTIVE'), // ACTIVE, REPAIRED, NOT_DETECTED
  matchingConfidence: doublePrecision('matching_confidence'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Indication Matches (Explicit linkage between observation and physical indication)
export const indicationMatches = pgTable('indication_matches', {
  id: serial('id').primaryKey(),
  physicalIndicationId: integer('physical_indication_id').references(() => physicalIndications.id).notNull(),
  observationId: integer('observation_id').references(() => inspectionObservations.id).notNull(),
  confidenceScore: doublePrecision('confidence_score'),
  confidenceLevel: varchar('confidence_level', { length: 50 }).default('HIGH'), // HIGH, MEDIUM, LOW, REVIEW_REQUIRED
  matchExplanation: text('match_explanation'),
  status: varchar('status', { length: 50 }).default('AUTOMATIC'), // AUTOMATIC, CONFIRMED, REJECTED, OVERRIDDEN
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. Repair Events
export const repairEvents = pgTable('repair_events', {
  id: serial('id').primaryKey(),
  drumId: integer('drum_id').references(() => cokeDrums.id).notNull(),
  weldJointId: integer('weld_joint_id').references(() => weldJoints.id).notNull(),
  physicalIndicationId: integer('physical_indication_id').references(() => physicalIndications.id),
  repairDate: timestamp('repair_date').notNull(),
  repairType: varchar('repair_type', { length: 100 }).notNull(),
  notes: text('notes'),
  supportingFileKey: varchar('supporting_file_key', { length: 512 }),
  enteredBy: integer('entered_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  objectType: varchar('object_type', { length: 100 }),
  objectId: varchar('object_id', { length: 100 }),
  previousValue: jsonb('previous_value'),
  newValue: jsonb('new_value'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
