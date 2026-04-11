import React, { useEffect, useState } from 'react';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Title.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Table.js';
import '@ui5/webcomponents/dist/TableColumn.js';
import '@ui5/webcomponents/dist/TableRow.js';
import '@ui5/webcomponents/dist/TableCell.js';
import '@ui5/webcomponents-fiori/dist/ShellBar.js';
import { getPlantInfo, getBatches, type SAPPlantInfo, type SAPBatch } from '../services/sapService';

/**
 * SAP Fiori-style Dashboard for Trelleborg Rutherfordton
 * Responsive design for Android, iOS, and Windows
 */

export default function FioriDashboard() {
  const [plantInfo, setPlantInfo] = useState<SAPPlantInfo | null>(null);
  const [batches, setBatches] = useState<SAPBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      setError(null);
      
      const [plant, batchData] = await Promise.all([
        getPlantInfo(),
        getBatches({ status: 'IN_PROGRESS' }),
      ]);
      
      setPlantInfo(plant);
      setBatches(batchData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  const inQueueCount = batches.filter(b => b.Status === 'IN_QUEUE').length;
  const inProgressCount = batches.filter(b => b.Status === 'IN_PROGRESS').length;
  const flaggedCount = batches.filter(b => b.Status === 'FLAGGED').length;

  return (
    <div className="fiori-dashboard">
      {/* SAP Fiori Shell Bar */}
      <ui5-shellbar
        primary-title="TiM Production Manager"
        secondary-title={plantInfo ? `${plantInfo.PlantName} (${plantInfo.PlantCode})` : 'Loading...'}
        show-notifications
        show-product-switch
        show-co-pilot
      ></ui5-shellbar>

      <div className="fiori-dashboard__content">
        {loading && (
          <div className="fiori-dashboard__loading">
            <ui5-busy-indicator active size="Large"></ui5-busy-indicator>
          </div>
        )}

        {error && (
          <div className="fiori-dashboard__error">
            <ui5-message-strip design="Negative" hide-close-button>
              {error}
            </ui5-message-strip>
          </div>
        )}

        {!loading && !error && plantInfo && (
          <>
            {/* Overview Cards */}
            <div className="fiori-dashboard__cards">
              <ui5-card className="fiori-dashboard__card">
                <ui5-card-header slot="header" title-text="In Queue" subtitle-text="Batches waiting" />
                <div className="fiori-card__content">
                  <ui5-title level="H1">{inQueueCount}</ui5-title>
                </div>
              </ui5-card>

              <ui5-card className="fiori-dashboard__card">
                <ui5-card-header slot="header" title-text="In Progress" subtitle-text="Currently processing" />
                <div className="fiori-card__content">
                  <ui5-title level="H1">{inProgressCount}</ui5-title>
                </div>
              </ui5-card>

              <ui5-card className="fiori-dashboard__card">
                <ui5-card-header slot="header" title-text="Flagged" subtitle-text="Requires attention" status="Error" />
                <div className="fiori-card__content">
                  <ui5-title level="H1">{flaggedCount}</ui5-title>
                </div>
              </ui5-card>
            </div>

            {/* Work Centers */}
            <ui5-card className="fiori-dashboard__work-centers">
              <ui5-card-header slot="header" title-text="Work Centers" subtitle-text={`${plantInfo.WorkCenters.length} active`} />
              <div className="fiori-card__content">
                <ui5-table class="fiori-table">
                  <ui5-table-column slot="columns">
                    <ui5-label>Work Center</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Name</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Description</ui5-label>
                  </ui5-table-column>

                  {plantInfo.WorkCenters.map((wc) => (
                    <ui5-table-row key={wc.WorkCenter}>
                      <ui5-table-cell>{wc.WorkCenter}</ui5-table-cell>
                      <ui5-table-cell>{wc.WorkCenterName}</ui5-table-cell>
                      <ui5-table-cell>{wc.Description || '-'}</ui5-table-cell>
                    </ui5-table-row>
                  ))}
                </ui5-table>
              </div>
            </ui5-card>

            {/* Active Batches */}
            <ui5-card className="fiori-dashboard__batches">
              <ui5-card-header slot="header" title-text="Active Batches" subtitle-text={`${batches.length} total`} />
              <div className="fiori-card__content">
                <ui5-table class="fiori-table">
                  <ui5-table-column slot="columns">
                    <ui5-label>Lot Number</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Material</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Quantity</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Status</ui5-label>
                  </ui5-table-column>
                  <ui5-table-column slot="columns">
                    <ui5-label>Work Center</ui5-label>
                  </ui5-table-column>

                  {batches.slice(0, 10).map((batch) => (
                    <ui5-table-row key={batch.BatchID}>
                      <ui5-table-cell>{batch.LotNumber}</ui5-table-cell>
                      <ui5-table-cell>
                        {batch.MaterialDescription}
                        <br />
                        <small style={{ color: '#6a6d70' }}>{batch.MaterialNumber}</small>
                      </ui5-table-cell>
                      <ui5-table-cell>
                        {batch.Quantity} {batch.UnitOfMeasure}
                      </ui5-table-cell>
                      <ui5-table-cell>
                        <ui5-badge color-scheme={
                          batch.Status === 'IN_PROGRESS' ? '8' : 
                          batch.Status === 'FLAGGED' ? '1' : 
                          '7'
                        }>
                          {batch.Status}
                        </ui5-badge>
                      </ui5-table-cell>
                      <ui5-table-cell>{batch.WorkCenterName}</ui5-table-cell>
                    </ui5-table-row>
                  ))}
                </ui5-table>
              </div>
            </ui5-card>
          </>
        )}
      </div>
    </div>
  );
}
