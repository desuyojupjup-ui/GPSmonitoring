// GeoStride DEMO - Device Binding (Mock)
// No actual Firebase writes. Returns approved status immediately.

import { getDeviceId } from './deviceInfo';

export async function verifyDeviceBinding(employeeId, employeeName) {
  const deviceId = await getDeviceId();
  // Demo: auto-approve all devices
  return { status: 'approved', deviceId, message: 'Device verified (demo mode).' };
}

export async function requestDeviceChange(employeeId, employeeName) {
  const deviceId = await getDeviceId();
  return { status: 'pending', deviceId, message: 'Change request submitted (demo).' };
}