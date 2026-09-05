import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { validateInventory } from '../edge-functions/api/inventory.js';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('seed inventory references valid care profiles, rooms and images', async () => {
  const [profiles, inventory, rooms] = await Promise.all([
    readJson('../data/care-profiles.json'),
    readJson('../data/inventory.json'),
    readJson('../data/rooms.json'),
  ]);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const roomNames = new Set(rooms.map((room) => room.name));

  assert.doesNotThrow(() => validateInventory(inventory));
  assert.equal(new Set(inventory.plants.map((plant) => plant.id)).size, inventory.plants.length);
  for (const plant of inventory.plants) {
    assert.ok(profileIds.has(plant.profileId), `${plant.id} has an unknown care profile`);
    assert.ok(roomNames.has(plant.room), `${plant.id} has an unknown room`);
    await access(new URL(`../${plant.image}`, import.meta.url));
  }
});

test('care profiles retain seasonal, light and source information', async () => {
  const profiles = await readJson('../data/care-profiles.json');
  assert.equal(profiles.length, 102, 'catalogue should contain 102 reviewed profiles');
  assert.equal(new Set(profiles.map((profile) => profile.id)).size, profiles.length, 'profile ids should be unique');
  for (const profile of profiles) {
    assert.ok(profile.commonName, `${profile.id} lacks a common name`);
    assert.ok(profile.scientificName, `${profile.id} lacks a scientific name`);
    assert.ok(Array.isArray(profile.aliases), `${profile.id} lacks aliases`);
    assert.equal(new Set(profile.aliases).size, profile.aliases.length, `${profile.id} has duplicate aliases`);
    assert.ok(profile.category, `${profile.id} lacks a category`);
    assert.ok(profile.care?.summer?.water, `${profile.id} lacks summer watering advice`);
    assert.ok(profile.care?.summer?.feed, `${profile.id} lacks summer feeding advice`);
    assert.ok(profile.care?.winter?.water, `${profile.id} lacks winter watering advice`);
    assert.ok(profile.care?.winter?.feed, `${profile.id} lacks winter feeding advice`);
    const dli = profile.care?.lightDli;
    assert.ok(dli, `${profile.id} lacks a DLI range`);
    assert.ok(Number.isFinite(dli.min) && dli.min >= 0, `${profile.id} has an invalid minimum DLI`);
    assert.ok(Number.isFinite(dli.max) && dli.max > dli.min, `${profile.id} has an invalid maximum DLI`);
    assert.ok(profile.care?.meter, `${profile.id} lacks moisture-meter advice`);
    assert.ok(profile.care?.light, `${profile.id} lacks light advice`);
    assert.ok(profile.sources?.length, `${profile.id} lacks an authoritative source`);
    for (const source of profile.sources) {
      assert.ok(source.label, `${profile.id} has an unlabelled source`);
      assert.doesNotThrow(() => new URL(source.url), `${profile.id} has an invalid source URL`);
      assert.equal(new URL(source.url).protocol, 'https:', `${profile.id} has a non-HTTPS source`);
    }
  }
});

test('the public seed inventory contains only generic sample specimens', async () => {
  const inventory = await readJson('../data/inventory.json');
  assert.equal(inventory.plants.length, 3);
  assert.ok(inventory.plants.every((plant) => plant.id.startsWith('sample-')));
  assert.ok(inventory.plants.every((plant) => plant.image === 'images/placeholder.svg'));
});

test('the public template bundles no personal photographs', async () => {
  const [profiles, imageFiles] = await Promise.all([
    readJson('../data/care-profiles.json'),
    readdir(new URL('../images/', import.meta.url)),
  ]);
  assert.deepEqual(imageFiles, ['placeholder.svg']);
  assert.ok(profiles.every((profile) => profile.defaultImage === 'images/placeholder.svg'));
});
