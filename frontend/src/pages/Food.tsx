import { useState } from 'react';
import styles from './Food.module.css';

type Platform = 'grab' | 'lineman';
type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'late_night';
type Budget = 'budget' | 'normal' | 'splurge';

interface FoodOrder {
  id: string;
  date: string;
  restaurant: string;
  items: string;
  price: number;
  platform: Platform;
  rating?: number;
}

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: string; url: string; color: string }> = {
  grab: { label: 'Grab Food', icon: '🟢', url: 'https://food.grab.com/th/en/', color: '#00b14f' },
  lineman: { label: 'LINE MAN', icon: '🟤', url: 'https://lineman.line.me/', color: '#06c755' },
};

const MEAL_SUGGESTIONS: Record<MealTime, string[]> = {
  breakfast: ['โจ๊ก/ข้าวต้ม', 'ปาท่องโก๋+กาแฟ', 'แซนวิช', 'ข้าวไข่เจียว', 'สมูทตี้'],
  lunch: ['ข้าวกะเพรา', 'ก๋วยเตี๋ยว', 'ส้มตำ', 'ข้าวมันไก่', 'ข้าวหมูแดง', 'สเต็ก'],
  dinner: ['ชาบู', 'ปิ้งย่าง', 'อาหารญี่ปุ่น', 'ข้าวต้มปลา', 'พิซซ่า', 'หมูกระทะ'],
  late_night: ['มาม่า', 'โจ๊ก', 'ข้าวผัด', 'ราเมน', 'เบอร์เกอร์'],
};

function getMealTime(): MealTime {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
  return 'late_night';
}

function getMealTimeLabel(mt: MealTime): string {
  const labels: Record<MealTime, string> = {
    breakfast: 'มื้อเช้า',
    lunch: 'มื้อกลางวัน',
    dinner: 'มื้อเย็น',
    late_night: 'มื้อดึก',
  };
  return labels[mt];
}

export function Food() {
  const [activeTab, setActiveTab] = useState<'order' | 'history' | 'favorites'>('order');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [budget, setBudget] = useState<Budget>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [orders] = useState<FoodOrder[]>([]);
  const [favorites] = useState<string[]>([]);

  const mealTime = getMealTime();
  const suggestions = MEAL_SUGGESTIONS[mealTime];

  function openPlatform(platform: Platform) {
    window.open(PLATFORM_CONFIG[platform].url, '_blank');
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Food</h1>
        <div className={styles.mealTimeBadge}>
          {mealTime === 'breakfast' && '🌅'}
          {mealTime === 'lunch' && '☀️'}
          {mealTime === 'dinner' && '🌆'}
          {mealTime === 'late_night' && '🌙'}
          {' '}{getMealTimeLabel(mealTime)}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['order', 'history', 'favorites'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'order' && '🍽️ สั่งอาหาร'}
            {tab === 'history' && '📋 ประวัติ'}
            {tab === 'favorites' && '⭐ ร้านโปรด'}
          </button>
        ))}
      </div>

      {/* Order Tab */}
      {activeTab === 'order' && (
        <div className={styles.content}>
          {/* Platform Selection */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>เลือกแพลตฟอร์ม</h2>
            <div className={styles.platformGrid}>
              {(Object.keys(PLATFORM_CONFIG) as Platform[]).map(p => (
                <button
                  key={p}
                  className={`${styles.platformCard} ${selectedPlatform === p ? styles.selected : ''}`}
                  onClick={() => setSelectedPlatform(p)}
                  style={{ '--platform-color': PLATFORM_CONFIG[p].color } as React.CSSProperties}
                >
                  <span className={styles.platformIcon}>{PLATFORM_CONFIG[p].icon}</span>
                  <span className={styles.platformLabel}>{PLATFORM_CONFIG[p].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>งบประมาณ</h2>
            <div className={styles.budgetGrid}>
              {([
                { key: 'budget' as Budget, label: 'ประหยัด', desc: '< 100฿', icon: '💰' },
                { key: 'normal' as Budget, label: 'ปกติ', desc: '100-300฿', icon: '🍽️' },
                { key: 'splurge' as Budget, label: 'ฟุ่มเฟือย', desc: '300+฿', icon: '✨' },
              ]).map(b => (
                <button
                  key={b.key}
                  className={`${styles.budgetCard} ${budget === b.key ? styles.selected : ''}`}
                  onClick={() => setBudget(b.key)}
                >
                  <span className={styles.budgetIcon}>{b.icon}</span>
                  <span className={styles.budgetLabel}>{b.label}</span>
                  <span className={styles.budgetDesc}>{b.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>แนะนำสำหรับ{getMealTimeLabel(mealTime)}</h2>
            <div className={styles.suggestionGrid}>
              {suggestions.map(s => (
                <button
                  key={s}
                  className={styles.suggestionChip}
                  onClick={() => setSearchQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className={styles.section}>
            <div className={styles.searchRow}>
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ค้นหาร้านอาหาร / เมนู..."
              />
              <button
                className={styles.searchBtn}
                onClick={() => {
                  if (selectedPlatform) {
                    const url = selectedPlatform === 'grab'
                      ? `https://food.grab.com/th/en/restaurants?search=${encodeURIComponent(searchQuery)}`
                      : `https://lineman.line.me/search?q=${encodeURIComponent(searchQuery)}`;
                    window.open(url, '_blank');
                  }
                }}
                disabled={!selectedPlatform || !searchQuery}
              >
                ค้นหา
              </button>
            </div>
          </div>

          {/* Quick Open */}
          {selectedPlatform && (
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
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className={styles.content}>
          {orders.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <div className={styles.emptyText}>ยังไม่มีประวัติสั่งอาหาร</div>
              <div className={styles.emptySubtext}>Iris จะบันทึกให้อัตโนมัติเมื่อสั่งอาหาร</div>
            </div>
          ) : (
            <div className={styles.orderList}>
              {orders.map(order => (
                <div key={order.id} className={styles.orderCard}>
                  <div className={styles.orderTop}>
                    <span className={styles.orderRestaurant}>{order.restaurant}</span>
                    <span className={styles.orderPrice}>{order.price}฿</span>
                  </div>
                  <div className={styles.orderItems}>{order.items}</div>
                  <div className={styles.orderMeta}>
                    <span>{PLATFORM_CONFIG[order.platform].icon} {PLATFORM_CONFIG[order.platform].label}</span>
                    <span>{order.date}</span>
                    {order.rating && <span>{'⭐'.repeat(order.rating)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favorites' && (
        <div className={styles.content}>
          {favorites.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⭐</div>
              <div className={styles.emptyText}>ยังไม่มีร้านโปรด</div>
              <div className={styles.emptySubtext}>บอก Iris ว่าชอบร้านไหน แล้ว Iris จะจำไว้ให้ค่ะ</div>
            </div>
          ) : (
            <div className={styles.favoritesList}>
              {favorites.map((fav, i) => (
                <div key={i} className={styles.favoriteCard}>
                  <span className={styles.favStar}>⭐</span>
                  <span>{fav}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
