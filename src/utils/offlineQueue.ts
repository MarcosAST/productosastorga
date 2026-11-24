import {
  Cliente,
  ConceptoGasto,
  ConceptoIngreso,
  Egreso,
  FinanzaMensual,
  IngresoOtro,
  Jornada,
  MovimientoInventario,
  Producto,
  Ruta,
  Sueldo,
  Ticket,
} from '../types/business';

export interface InventoryDelta {
  productoId: string;
  productoNombre: string;
  delta: number;
}

export type OfflineQueuedAction =
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_ruta';
      nombre: string;
      descripcion: string;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_ruta';
      ruta: Ruta;
      oldNombre?: string;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_ticket';
      tempFolio: string;
      draft: Omit<Ticket, 'folio' | 'detalleTexto'>;
      deductGeneralInventory?: boolean;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_ticket';
      ticket: Ticket;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_ticket';
      folio: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_cliente';
      tempId: string;
      draft: Omit<Cliente, 'id' | 'fechaRegistro'>;
      newRutaNombre?: string;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_cliente';
      cliente: Cliente;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_cliente';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_producto';
      tempId: string;
      draft: Omit<Producto, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_producto';
      prod: Producto;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_producto';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'adjust_inventario';
      deltas: InventoryDelta[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_movimientos_inv';
      items: Omit<MovimientoInventario, 'id'>[];
      adjustDeltas?: InventoryDelta[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_jornada';
      tempId: string;
      draft: Omit<Jornada, 'id'>;
      selectedTickets: Ticket[];
      inventoryDeltas?: InventoryDelta[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_jornada';
      jornada: Jornada;
      inventoryDeltas?: InventoryDelta[];
      assignedTickets?: Ticket[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'finalize_jornada';
      jornada: Jornada;
      returnDeltas: InventoryDelta[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_jornada';
      id: string;
      rowNumber?: number;
      restoreDeltas?: InventoryDelta[];
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_ingreso_otro';
      tempId: string;
      draft: Omit<IngresoOtro, 'id'>;
      saveConcept?: Omit<ConceptoIngreso, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_ingreso_otro';
      ingreso: IngresoOtro;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_ingreso_otro';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_concepto_ingreso';
      tempId: string;
      draft: Omit<ConceptoIngreso, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_concepto_ingreso';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_egreso';
      tempId: string;
      draft: Omit<Egreso, 'id'>;
      saveConcept?: Omit<ConceptoGasto, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_egreso';
      egreso: Egreso;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_egreso';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_concepto';
      tempId: string;
      draft: Omit<ConceptoGasto, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_concepto';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'create_sueldo';
      tempId: string;
      draft: Omit<Sueldo, 'id'>;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'update_sueldo';
      sueldo: Sueldo;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'delete_sueldo';
      id: string;
      rowNumber?: number;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'upsert_finanza';
      record: FinanzaMensual;
    }
  | {
      qid: string;
      createdAt: string;
      summary: string;
      type: 'close_month';
      closedRecord: FinanzaMensual;
      nextMonthRecord: FinanzaMensual;
    };

const MANUAL_OFFLINE_KEY = 'astorga_manual_offline_v1';
const QUEUE_KEY_PREFIX = 'astorga_offline_queue_v1_';

export function loadManualOfflineMode(): boolean {
  try {
    return localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveManualOfflineMode(enabled: boolean): void {
  try {
    localStorage.setItem(MANUAL_OFFLINE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore
  }
}

export function loadOfflineQueue(spreadsheetKey: string): OfflineQueuedAction[] {
  const key = `${QUEUE_KEY_PREFIX}${spreadsheetKey || 'local'}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(
  spreadsheetKey: string,
  queue: OfflineQueuedAction[]
): void {
  const key = `${QUEUE_KEY_PREFIX}${spreadsheetKey || 'local'}`;
  try {
    localStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // Ignore storage quota errors
  }
}
