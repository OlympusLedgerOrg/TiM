import { prisma } from '../prisma/client.js';

/**
 * SAP Middleware Service
 * Provides integration with SAP PI/PO and SAP Cloud Integration (CPI).
 *
 * Supports:
 * - IDoc XML format for inbound/outbound messages
 * - RFC function call mapping
 * - OData batch processing
 * - Middleware health check and configuration
 */

export interface SAPMiddlewareConfig {
  type: 'PI_PO' | 'CLOUD_INTEGRATION';
  baseUrl: string;
  clientId?: string;
  authType: 'BASIC' | 'OAUTH2' | 'CERTIFICATE';
  enabled: boolean;
}

export interface IDocMessage {
  idocType: string;
  mesType: string;
  senderPort: string;
  senderPartner: string;
  receiverPort: string;
  receiverPartner: string;
  segments: IDocSegment[];
}

export interface IDocSegment {
  name: string;
  fields: Record<string, string>;
  children?: IDocSegment[];
}

/** Format a Date to SAP's YYYYMMDD string (e.g. 20260411). */
function formatSAPDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// ---------- Configuration ----------

/**
 * Get the current SAP middleware configuration for a tenant.
 */
export async function getMiddlewareConfig(tenantId: string): Promise<{
  status: number;
  body: object;
}> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return { status: 404, body: { message: 'Tenant not found' } };
  }

  // Build config from environment (per-tenant overrides possible)
  const config: SAPMiddlewareConfig = {
    type: (process.env.SAP_MIDDLEWARE_TYPE as 'PI_PO' | 'CLOUD_INTEGRATION') || 'CLOUD_INTEGRATION',
    baseUrl: process.env.SAP_MIDDLEWARE_URL || '',
    clientId: process.env.SAP_MIDDLEWARE_CLIENT_ID || undefined,
    authType: (process.env.SAP_MIDDLEWARE_AUTH_TYPE as 'BASIC' | 'OAUTH2' | 'CERTIFICATE') || 'BASIC',
    enabled: process.env.SAP_MIDDLEWARE_ENABLED === 'true',
  };

  return {
    status: 200,
    body: {
      tenantId,
      plantCode: tenant.sapPlantCode || '',
      middleware: {
        type: config.type,
        baseUrl: config.baseUrl ? '***configured***' : 'not configured',
        authType: config.authType,
        enabled: config.enabled,
      },
    },
  };
}

// ---------- IDoc Processing ----------

/**
 * Convert a TiM batch to an IDoc LOIPRO (Production Order) segment.
 */
export async function batchToIDoc(tenantId: string, batchId: string): Promise<{
  status: number;
  body: object;
}> {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, tenantId },
    include: {
      material: true,
      workCenter: true,
    },
  });

  if (!batch) {
    return { status: 404, body: { message: 'Batch not found' } };
  }

  const idoc: IDocMessage = {
    idocType: 'LOIPRO07',
    mesType: 'LOIPRO',
    senderPort: 'TIM_PORT',
    senderPartner: 'TIM_SYSTEM',
    receiverPort: 'SAP_PORT',
    receiverPartner: process.env.SAP_SYSTEM_ID || 'SAPCLNT100',
    segments: [
      {
        name: 'E1ORHDR',
        fields: {
          AUFNR: batch.lotNumber,
          AUART: 'PP01',
          WERKS: batch.workCenter.code,
          GAMNG: batch.quantity.toString(),
          GMEIN: batch.material.unitOfMeasure,
          GLTRS: formatSAPDate(batch.createdAt),
        },
        children: [
          {
            name: 'E1ORITEM',
            fields: {
              MATNR: batch.material.sapMaterialNumber || '',
              MAKTX: batch.material.description,
              BDMNG: batch.quantity.toString(),
              MEINS: batch.material.unitOfMeasure,
            },
          },
        ],
      },
    ],
  };

  return { status: 200, body: { idoc } };
}

/**
 * Convert a TiM movement to an IDoc MBGMCR (Goods Movement) segment.
 */
export async function movementToIDoc(tenantId: string, movementId: string): Promise<{
  status: number;
  body: object;
}> {
  const movement = await prisma.movement.findFirst({
    where: { id: movementId, tenantId },
    include: {
      batch: {
        include: { material: true },
      },
      fromWorkCenter: true,
      toWorkCenter: true,
    },
  });

  if (!movement) {
    return { status: 404, body: { message: 'Movement not found' } };
  }

  const idoc: IDocMessage = {
    idocType: 'MBGMCR03',
    mesType: 'MBGMCR',
    senderPort: 'TIM_PORT',
    senderPartner: 'TIM_SYSTEM',
    receiverPort: 'SAP_PORT',
    receiverPartner: process.env.SAP_SYSTEM_ID || 'SAPCLNT100',
    segments: [
      {
        name: 'E1BP2017_GM_HEAD_01',
        fields: {
          PSTNG_DATE: formatSAPDate(movement.movedAt),
          DOC_DATE: formatSAPDate(movement.movedAt),
          REF_DOC_NO: movement.batch.lotNumber,
          HEADER_TXT: movement.notes || '',
        },
        children: [
          {
            name: 'E1BP2017_GM_ITEM_CREATE',
            fields: {
              MATERIAL: movement.batch.material.sapMaterialNumber || '',
              PLANT: movement.fromWorkCenter.code,
              STGE_LOC: movement.toWorkCenter.code,
              MOVE_TYPE: '311', // Transfer posting
              ENTRY_QNT: movement.quantity.toString(),
              ENTRY_UOM: movement.batch.material.unitOfMeasure,
              MVT_IND: '',
              BATCH: movement.batch.lotNumber,
            },
          },
        ],
      },
    ],
  };

  return { status: 200, body: { idoc } };
}

// ---------- Middleware Health ----------

/**
 * Test connectivity to the SAP middleware endpoint.
 */
export async function testMiddlewareConnection(): Promise<{
  status: number;
  body: object;
}> {
  const middlewareUrl = process.env.SAP_MIDDLEWARE_URL;
  if (!middlewareUrl) {
    return {
      status: 200,
      body: {
        connected: false,
        message: 'SAP middleware URL not configured',
        type: process.env.SAP_MIDDLEWARE_TYPE || 'CLOUD_INTEGRATION',
      },
    };
  }

  try {
    const res = await fetch(`${middlewareUrl}/api/v1/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: 200,
      body: {
        connected: res.ok,
        httpStatus: res.status,
        type: process.env.SAP_MIDDLEWARE_TYPE || 'CLOUD_INTEGRATION',
        message: res.ok ? 'Connection successful' : `Connection returned ${res.status}`,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        connected: false,
        message: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: process.env.SAP_MIDDLEWARE_TYPE || 'CLOUD_INTEGRATION',
      },
    };
  }
}

// ---------- IDoc XML Rendering ----------

/**
 * Render an IDoc message to XML string for SAP PI/PO consumption.
 */
export function renderIDocXml(idoc: IDocMessage): string {
  const renderSegment = (seg: IDocSegment, indent: string): string => {
    const fields = Object.entries(seg.fields)
      .map(([k, v]) => `${indent}  <${k}>${escapeXml(v)}</${k}>`)
      .join('\n');
    const children = seg.children
      ? seg.children.map(c => renderSegment(c, indent + '  ')).join('\n')
      : '';
    return `${indent}<${seg.name}>\n${fields}\n${children}\n${indent}</${seg.name}>`;
  };

  const segments = idoc.segments.map(s => renderSegment(s, '    ')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<IDOC BEGIN="1">
  <EDI_DC40>
    <IDOCTYP>${escapeXml(idoc.idocType)}</IDOCTYP>
    <MESTYP>${escapeXml(idoc.mesType)}</MESTYP>
    <SNDPOR>${escapeXml(idoc.senderPort)}</SNDPOR>
    <SNDPRN>${escapeXml(idoc.senderPartner)}</SNDPRN>
    <RCVPOR>${escapeXml(idoc.receiverPort)}</RCVPOR>
    <RCVPRN>${escapeXml(idoc.receiverPartner)}</RCVPRN>
  </EDI_DC40>
  <IDOC_DATA>
${segments}
  </IDOC_DATA>
</IDOC>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
