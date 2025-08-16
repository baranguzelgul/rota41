// Neo4j bağlantı yapılandırma
const neo4j = require('neo4j-driver');
require('dotenv').config();

// .env dosyasından veritabanı bilgilerini al, yoksa varsayılan değerleri kullan
const URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const USER = process.env.NEO4J_USER || "neo4j";
const PASSWORD = process.env.NEO4J_PASSWORD || "baranbaran"; // Güvenlik için değiştirin

// Neo4j sürücüsü oluştur
const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

// Bağlantı testi
async function testConnection() {
  const session = driver.session();
  try {
    await session.run('RETURN "Bağlantı başarılı" as message');
    console.log("Neo4j veritabanına başarıyla bağlanıldı");
    return true;
  } catch (error) {
    console.error("Neo4j bağlantı hatası:", error);
    return false;
  } finally {
    await session.close();
  }
}

module.exports = {
  driver,
  testConnection
}; 