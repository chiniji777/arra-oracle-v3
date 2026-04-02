import { useState } from 'react';
import styles from './Transport.module.css';

type ServiceType = 'ride' | 'delivery';
type Platform = 'grab' | 'lineman' | 'lalamove';

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: string; url: string; color: string; services: ServiceType[] }> = {
  grab: { label: 'Grab', icon: '🟢', url: 'https://www.grab.com/th/en/', color: '#00b14f', services: ['ride'] },
  lineman: { label: 'LINE MAN', icon: '🟤', url: 'https://lineman.line.me/', color: '#06c755', services: ['ride'] },
  lalamove: { label: 'Lalamove', icon: '🟠', url: 'https://www.lalamove.com/en-th/', color: '#f26722', services: ['delivery'] },
};

interface SavedPlace {
  name: string;
  address: string;
  icon: string;
}

const SAVED_PLACES: SavedPlace[] = [
  { name: 'บ้าน', address: 'อ่อนนุช 46, หนองบอน, ประเวศ, กรุงเทพฯ', icon: '🏠' },
];

interface DeliveryQuote {
  platform: Platform;
  vehicleType: string;
  price: number;
  eta: string;
}

export function Transport() {
  const [serviceType, setServiceType] = useState<ServiceType>('ride');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [quotes] = useState<DeliveryQuote[]>([]);
  const [recentTrips] = useState<{ date: string; from: string; to: string; price: number; platform: Platform }[]>([]);

  const filteredPlatforms = (Object.keys(PLATFORM_CONFIG) as Platform[]).filter(
    p => PLATFORM_CONFIG[p].services.includes(serviceType)
  );

  function openPlatform(platform: Platform) {
    window.open(PLATFORM_CONFIG[platform].url, '_blank');
  }

  function fillPlace(place: SavedPlace, field: 'pickup' | 'dropoff') {
    if (field === 'pickup') setPickup(place.address);
    else setDropoff(place.address);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Transportation</h1>
      </div>

      {/* Service Type Toggle */}
      <div className={styles.serviceToggle}>
        <button
          className={`${styles.toggleBtn} ${serviceType === 'ride' ? styles.active : ''}`}
          onClick={() => { setServiceType('ride'); setSelectedPlatform(null); }}
        >
          🚗 เรียกรถ
        </button>
        <button
          className={`${styles.toggleBtn} ${serviceType === 'delivery' ? styles.active : ''}`}
          onClick={() => { setServiceType('delivery'); setSelectedPlatform(null); }}
        >
          📦 ส่งของ
        </button>
      </div>

      {/* Route Input */}
      <div className={styles.routeSection}>
        <div className={styles.routeInputGroup}>
          <div className={styles.routeDot} style={{ background: '#4caf50' }} />
          <div className={styles.routeInputWrapper}>
            <input
              className={styles.routeInput}
              value={pickup}
              onChange={e => setPickup(e.target.value)}
              placeholder="จุดรับ / ต้นทาง"
            />
            <div className={styles.savedPlaces}>
              {SAVED_PLACES.map(place => (
                <button
                  key={place.name}
                  className={styles.savedPlaceBtn}
                  onClick={() => fillPlace(place, 'pickup')}
                  title={place.address}
                >
                  {place.icon} {place.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.routeLine} />

        <div className={styles.routeInputGroup}>
          <div className={styles.routeDot} style={{ background: '#f44336' }} />
          <div className={styles.routeInputWrapper}>
            <input
              className={styles.routeInput}
              value={dropoff}
              onChange={e => setDropoff(e.target.value)}
              placeholder="จุดส่ง / ปลายทาง"
            />
            <div className={styles.savedPlaces}>
              {SAVED_PLACES.map(place => (
                <button
                  key={place.name}
                  className={styles.savedPlaceBtn}
                  onClick={() => fillPlace(place, 'dropoff')}
                  title={place.address}
                >
                  {place.icon} {place.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Platform Selection */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {serviceType === 'ride' ? 'เลือกแอปเรียกรถ' : 'เลือกแอปส่งของ'}
        </h2>
        <div className={styles.platformGrid}>
          {filteredPlatforms.map(p => (
            <button
              key={p}
              className={`${styles.platformCard} ${selectedPlatform === p ? styles.selected : ''}`}
              onClick={() => setSelectedPlatform(p)}
              style={{ '--platform-color': PLATFORM_CONFIG[p].color } as React.CSSProperties}
            >
              <span className={styles.platformIcon}>{PLATFORM_CONFIG[p].icon}</span>
              <span className={styles.platformLabel}>{PLATFORM_CONFIG[p].label}</span>
              {p === 'lalamove' && <span className={styles.apiBadge}>API</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes (for Lalamove API) */}
      {selectedPlatform === 'lalamove' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>ราคาประมาณ</h2>
          {quotes.length === 0 ? (
            <div className={styles.quoteEmpty}>
              <p>กรอกจุดรับ-ส่ง แล้วกด "ดูราคา" เพื่อเช็คค่าส่ง</p>
              <button
                className={styles.quoteBtn}
                disabled={!pickup || !dropoff}
              >
                ดูราคา
              </button>
              <div className={styles.apiNote}>
                ต้องมี Lalamove API Key — สมัครได้ที่ lalamove.com/business/api-solutions
              </div>
            </div>
          ) : (
            <div className={styles.quoteList}>
              {quotes.map((q, i) => (
                <div key={i} className={styles.quoteCard}>
                  <div className={styles.quoteVehicle}>{q.vehicleType}</div>
                  <div className={styles.quotePrice}>{q.price}฿</div>
                  <div className={styles.quoteEta}>{q.eta}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Open Platform Button */}
      {selectedPlatform && selectedPlatform !== 'lalamove' && (
        <div className={styles.section}>
          <button
            className={styles.openPlatformBtn}
            onClick={() => openPlatform(selectedPlatform)}
            style={{ '--platform-color': PLATFORM_CONFIG[selectedPlatform].color } as React.CSSProperties}
          >
            {PLATFORM_CONFIG[selectedPlatform].icon} เปิด {PLATFORM_CONFIG[selectedPlatform].label}
          </button>
        </div>
      )}

      {/* Recent Trips */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>การเดินทางล่าสุด</h2>
        {recentTrips.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>{serviceType === 'ride' ? '🚗' : '📦'}</div>
            <div className={styles.emptyText}>ยังไม่มีประวัติ</div>
            <div className={styles.emptySubtext}>Iris จะบันทึกให้อัตโนมัติเมื่อใช้บริการ</div>
          </div>
        ) : (
          <div className={styles.tripList}>
            {recentTrips.map((trip, i) => (
              <div key={i} className={styles.tripCard}>
                <div className={styles.tripRoute}>
                  <span>{trip.from}</span>
                  <span className={styles.tripArrow}>→</span>
                  <span>{trip.to}</span>
                </div>
                <div className={styles.tripMeta}>
                  <span>{PLATFORM_CONFIG[trip.platform].icon} {PLATFORM_CONFIG[trip.platform].label}</span>
                  <span>{trip.price}฿</span>
                  <span>{trip.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
