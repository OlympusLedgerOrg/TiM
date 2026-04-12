import React, { useEffect, useState } from 'react';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Title.js';
import '@ui5/webcomponents/dist/Label.js';
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
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p>Loading dashboard...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="fiori-dashboard__error">
            <div style={{ padding: '1rem', backgroundColor: '#ffeaea', border: '1px solid #ff0000', borderRadius: '0.5rem' }}>
              {error}
            </div>
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
                <table className="fiori-simple-table">
                  <thead>
                    <tr>
                      <th>Work Center</th>
                      <th>Name</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plantInfo.WorkCenters.map((wc) => (
                      <tr key={wc.WorkCenter}>
                        <td>{wc.WorkCenter}</td>
                        <td>{wc.WorkCenterName}</td>
                        <td>{wc.Description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ui5-card>

            {/* Active Batches */}
            <ui5-card className="fiori-dashboard__batches">
              <ui5-card-header slot="header" title-text="Active Batches" subtitle-text={`${batches.length} total`} />
              <div className="fiori-card__content">
                <table className="fiori-simple-table">
                  <thead>
                    <tr>
                      <th>Lot Number</th>
                      <th>Material</th>
                      <th>Quantity</th>
                      <th>Status</th>
                      <th>Work Center</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 10).map((batch) => (
                      <tr key={batch.BatchID}>
                        <td>{batch.LotNumber}</td>
                        <td>
                          {batch.MaterialDescription}
                          <br />
                          <small style={{ color: '#6a6d70' }}>{batch.MaterialNumber}</small>
                        </td>
                        <td>
                          {batch.Quantity} {batch.UnitOfMeasure}
                        </td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            backgroundColor: batch.Status === 'IN_PROGRESS' ? '#0a6ed1' : 
                                           batch.Status === 'FLAGGED' ? '#ff0000' : 
                                           '#6a6d70',
                            color: '#ffffff',
                            fontSize: '0.875rem',
                          }}>
                            {batch.Status}
                          </span>
                        </td>
                        <td>{batch.WorkCenterName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ui5-card>
          </>
        )}
      </div>
    </div>
  );
}
