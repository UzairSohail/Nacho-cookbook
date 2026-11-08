/**
 * The offline database on each device. Mirrors supabase/schema.sql; PowerSync
 * adds the "id" column itself. Numbers are REAL, booleans 0/1, arrays JSON text.
 */
import { column, Schema, Table } from '@powersync/common';

const households = new Table({
  name: column.text,
  household_size: column.integer,
  unit_system: column.text,
  measure_standard: column.text,
  invite_code: column.text,
  created_at: column.text,
});

const household_members = new Table({
  household_id: column.text,
  user_id: column.text,
  role: column.text,
  joined_at: column.text,
});

const ingredients = new Table(
  {
    household_id: column.text,
    name: column.text,
    aisle: column.text,
    density: column.real,
  },
  { indexes: { household: ['household_id'] } },
);

const recipes = new Table(
  {
    household_id: column.text,
    title: column.text,
    description: column.text,
    servings: column.real,
    measure_standard: column.text,
    keeps_for_days: column.integer,
    prep_minutes: column.integer,
    cook_minutes: column.integer,
    photo_paths: column.text,
    tags: column.text,
    source_url: column.text,
    notes: column.text,
    favourite: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { household: ['household_id'] } },
);

const recipe_ingredients = new Table(
  {
    household_id: column.text,
    recipe_id: column.text,
    position: column.integer,
    ingredient_id: column.text,
    quantity: column.real,
    unit: column.text,
    note: column.text,
    group_name: column.text,
    scalable: column.integer,
    optional: column.integer,
  },
  { indexes: { recipe: ['recipe_id'] } },
);

const recipe_steps = new Table(
  {
    household_id: column.text,
    recipe_id: column.text,
    position: column.integer,
    text: column.text,
    photo_path: column.text,
  },
  { indexes: { recipe: ['recipe_id'] } },
);

const plan_entries = new Table(
  {
    household_id: column.text,
    date: column.text,
    slot: column.text,
    recipe_id: column.text,
    note: column.text,
    servings: column.real,
  },
  { indexes: { household_date: ['household_id', 'date'] } },
);

const pantry_staples = new Table({
  household_id: column.text,
  ingredient_id: column.text,
});

const shopping_items = new Table(
  {
    household_id: column.text,
    key: column.text,
    name: column.text,
    quantity: column.real,
    unit: column.text,
    aisle: column.text,
    checked: column.integer,
    edited: column.integer,
    sources: column.text,
    updated_at: column.text,
  },
  { indexes: { household: ['household_id'] } },
);

const shopping_dismissed = new Table({
  household_id: column.text,
  key: column.text,
});

export const AppSchema = new Schema({
  households,
  household_members,
  ingredients,
  recipes,
  recipe_ingredients,
  recipe_steps,
  plan_entries,
  pantry_staples,
  shopping_items,
  shopping_dismissed,
});
