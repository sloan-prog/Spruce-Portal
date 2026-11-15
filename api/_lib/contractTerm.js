/* Single source of truth for the contract term length.
 * Stored in spruce_config (config_key = 'contract_term_months'); falls back to 6
 * if the row is missing or unreadable. Change the value in the database to change
 * the term everywhere the renewal math runs.
 */
export async function getContractTermMonths(supabase) {
  try {
    const { data } = await supabase
      .from('spruce_config')
      .select('config_value')
      .eq('config_key', 'contract_term_months')
      .maybeSingle();
    const n = parseInt(data && data.config_value, 10);
    return Number.isFinite(n) && n > 0 ? n : 6;
  } catch (e) {
    return 6;
  }
}
