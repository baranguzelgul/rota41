const neo4j = require('neo4j-driver');

// Şu anki zamanı dakika cinsinden döndür (00:00'dan bu yana geçen dakika)
const getCurrentTime = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

// Bugünün gün tipini döndür (weekday, saturday, sunday)
const getDayType = () => {
  const day = new Date().getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
};

// YENİ: Belirli bir tarihe göre gün tipini döndürür
const getDayTypeFromDate = (date) => {
  const day = date.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
};

// Saat formatını (HH:MM) dakika cinsine dönüştür
const parseTime = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return null;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

// Dakikayı saat formatına dönüştür (HH:MM)
const formatTime = (minutes) => {
  if (minutes === null || isNaN(minutes)) return null;
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMins = String(mins).padStart(2, '0');
  return `${paddedHours}:${paddedMins}`;
};

// Dakikayı okunabilir süre formatına dönüştür
const formatDuration = (minutes) => {
  if (!minutes && minutes !== 0) return '';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours} saat ${mins > 0 ? `${mins} dk` : ''}`;
  }
  
  return `${mins} dk`;
};

const getCurrentTimeInMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

// YENİ: Belirli bir tarihe göre zamanı dakika cinsinden döndürür
const getTimeInMinutesFromDate = (date) => {
  return date.getHours() * 60 + date.getMinutes();
};

module.exports = {
  getCurrentTime,
  getDayType,
  getDayTypeFromDate,
  parseTime,
  formatTime,
  formatDuration,
  getCurrentTimeInMinutes,
  getTimeInMinutesFromDate
}; 