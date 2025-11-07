const FIVE_DAYS_IN_MS = 5 * 24 * 60 * 60 * 1000;

const supabaseLocalStorage = {
  getItem: (key) => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
      return null;
    }
    try {
      const item = JSON.parse(itemStr);
      const now = new Date();
      // Check if the item is expired
      if (item.expiry && now.getTime() > item.expiry) {
        // If expired, remove it and return null
        localStorage.removeItem(key);
        return null;
      }
      // If not expired, return the value
      return item.value;
    } catch (e) {
      // If parsing fails, it might be an old format, just return it
      return itemStr;
    }
  },
  setItem: (key, value) => {
    const now = new Date();
    // Wrap the value with an expiry timestamp
    const item = {
      value: value,
      expiry: now.getTime() + FIVE_DAYS_IN_MS,
    };
    localStorage.setItem(key, JSON.stringify(item));
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
  },
};

export default supabaseLocalStorage;
