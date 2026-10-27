// ──────────────────────────────────────────────────────────────────────────
// Client wrapper for the `analyzeFraud` Firebase Callable Function (which holds
// the Anthropic key server-side). Used by the employee Security Status screen
// to fetch / refresh the latest AI risk assessment.
// ──────────────────────────────────────────────────────────────────────────
import { getApp } from '../firebase';
import { getFunctions, httpsCallable } from '../firebase';

/**
 * @param {string} employeeId
 * @returns {Promise<{riskScore:number, riskLevel:string, anomalies:Array, explanation:string, recommendations:string[]}>}
 */
export async function runFraudAnalysis(employeeId) {
  const functions = getFunctions(getApp());
  const callable = httpsCallable(functions, 'analyzeFraud');
  const res = await callable({ employeeId });
  return res.data;
}
