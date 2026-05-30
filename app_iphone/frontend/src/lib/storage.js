import { MMKV } from 'react-native-mmkv';

/**
 * Instância única de storage persistente (MMKV).
 * Mora num módulo próprio, sem dependências internas, pra quebrar o ciclo
 * AuthContext <-> client (o client precisa do storage pros tokens, mas não
 * deve importar o AuthContext, senão vira require cycle).
 */
export const storage = new MMKV();
