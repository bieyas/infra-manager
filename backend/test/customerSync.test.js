import test from 'node:test'
import assert from 'node:assert/strict'
import { matchCustomerForDevice } from '../src/lib/customerSync.js'

test('matches a unique customer when the PPPoE username moves to another router', () => {
  const customer = {
    id: 'customer-a',
    pppoeUsername: 'subscriber01',
    connectionSourceDeviceId: 'router-a',
  }

  assert.deepEqual(
    matchCustomerForDevice([customer], 'SUBSCRIBER01', 'router-b'),
    { customer, ambiguous: false },
  )
})

test('prefers the unique customer already sourced from the current router', () => {
  const moved = { id: 'old', pppoeUsername: 'subscriber01', connectionSourceDeviceId: 'router-a' }
  const current = { id: 'current', pppoeUsername: 'SUBSCRIBER01', connectionSourceDeviceId: 'router-b' }

  assert.deepEqual(
    matchCustomerForDevice([moved, current], 'subscriber01', 'router-b'),
    { customer: current, ambiguous: false },
  )
})

test('does not select an arbitrary customer when the username matches multiple routers', () => {
  const customers = [
    { id: 'customer-a', pppoeUsername: 'subscriber01', connectionSourceDeviceId: 'router-a' },
    { id: 'customer-c', pppoeUsername: 'SUBSCRIBER01', connectionSourceDeviceId: 'router-c' },
  ]

  assert.deepEqual(
    matchCustomerForDevice(customers, 'subscriber01', 'router-b'),
    { customer: null, ambiguous: true },
  )
})

test('returns no match when the PPPoE username is not registered', () => {
  assert.deepEqual(matchCustomerForDevice([], 'subscriber01', 'router-a'), {
    customer: null,
    ambiguous: false,
  })
})
