/*
 * Bourgeon — configuration de la synchronisation (Supabase).
 *
 * Laisser vide pour une utilisation sans synchronisation (données dans ce
 * navigateur uniquement). Les deux valeurs se trouvent dans Supabase ▸
 * Project Settings ▸ API : « Project URL » et la clé « anon public »
 * (ou « publishable »). Cette clé est faite pour être publique : la base
 * est protégée par les règles d'accès (chacun ne voit que ses données).
 */
window.Bourgeon = window.Bourgeon || {};
window.Bourgeon.config = {
  supabaseUrl: 'https://jnvhnycxvmkfakvifiyy.supabase.co',
  supabaseKey: 'sb_publishable_vgPCiEHCDlm2Kh6fFJ9etQ_ARLMfTkU'
};
