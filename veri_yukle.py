

from neo4j import GraphDatabase
import csv
import os
import sys

class Neo4jDatabase:
    def __init__(self, uri, user, password):
        # Veritabanına bağlan
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        self.verify_connection()

    def verify_connection(self):
        # Bağlantıyı test et
        try:
            with self.driver.session() as session:
                result = session.run("RETURN 1 AS test")
                record = result.single()
                if record and record["test"] == 1:
                    print("Neo4j veritabanına bağlantı başarılı!")
                else:
                    print("Neo4j veritabanına bağlantı kuruldu ancak veri doğrulama başarısız!")
                    sys.exit(1)
        except Exception as e:
            print(f"Neo4j veritabanına bağlantı hatası: {e}")
            sys.exit(1)

    def close(self):
        # Bağlantıyı kapat
        self.driver.close()
        print("Veritabanı bağlantısı kapatıldı.")

    def clear_database(self):
        # Tüm veriyi sil
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
            print("Veritabanı temizlendi.")

    def create_constraints(self):
        # Kısıtlamaları oluştur
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Durak) REQUIRE s.stop_id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (r:Hat) REQUIRE r.route_id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:ShapeNoktasi) REQUIRE p.shape_id_seq IS UNIQUE")
            print("Kısıtlamalar oluşturuldu.")

    def create_indexes(self):
        # Hızlı arama için indexler
        with self.driver.session() as session:
            session.run("CREATE INDEX IF NOT EXISTS FOR (s:Durak) ON (s.name)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (r:Hat) ON (r.route_name)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (s:Durak) ON (s.lat, s.lon)")
            print("İndeksler oluşturuldu.")
    
    def import_stops(self, file_path):
        # Durakları yükle
        if not os.path.exists(file_path):
            print(f"Hata: {file_path} dosyası bulunamadı!")
            return

        with self.driver.session() as session:
            with open(file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                count = 0
                for row in csv_reader:
                    try:
                        required_columns = ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']
                        for col in required_columns:
                            if col not in row:
                                print(f"Uyarı: {col} sütunu bulunamadı. Satır atlanıyor: {row}")
                                continue

                        query = (
                            "MERGE (d:Durak {stop_id: $stop_id}) "
                            "ON CREATE SET d.name = $name, d.lat = $lat, d.lon = $lon, d.stop_code = $stop_code "
                            "ON MATCH SET d.name = $name, d.lat = $lat, d.lon = $lon, d.stop_code = $stop_code"
                        )
                        
                        try:
                            lat = float(row['stop_lat']) if row['stop_lat'] else 0
                            lon = float(row['stop_lon']) if row['stop_lon'] else 0
                        except ValueError:
                            print(f"Uyarı: Geçersiz koordinat değerleri - {row['stop_lat']}, {row['stop_lon']} - Satır atlanıyor: {row}")
                            continue
                        
                        session.run(query, 
                                    stop_id=row['stop_id'], 
                                    name=row['stop_name'], 
                                    lat=lat,
                                    lon=lon,
                                    stop_code=row.get('stop_code', ''))
                        count += 1
                        
                        if count % 1000 == 0:
                            print(f"{count} durak işlendi...")
                    
                    except Exception as e:
                        print(f"Hata: Durak eklenirken bir sorun oluştu: {e} - Satır: {row}")
                
                print(f"Toplam {count} durak veritabanına eklendi.")
    
    def import_shapes(self, file_path):
        """Hat şekil verilerini içeri aktarır."""
        if not os.path.exists(file_path):
            print(f"Hata: {file_path} dosyası bulunamadı!")
            return

        with self.driver.session() as session:
            with open(file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                count = 0
                shape_count = {}  # Shape başına nokta sayısı
                
                for row in csv_reader:
                    try:
                        required_columns = ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']
                        for col in required_columns:
                            if col not in row:
                                print(f"Uyarı: {col} sütunu bulunamadı. Satır atlanıyor: {row}")
                                continue
                        
                        shape_id = row['shape_id']
                        sequence = int(row['shape_pt_sequence'])
                        
                        if shape_id not in shape_count:
                            shape_count[shape_id] = 0
                        shape_count[shape_id] += 1
                        
                        shape_id_seq = f"{shape_id}_{sequence}"
                        
                        # Koordinatları kontrol et
                        try:
                            lat = float(row['shape_pt_lat'])
                            lon = float(row['shape_pt_lon'])
                        except ValueError:
                            print(f"Uyarı: Geçersiz koordinat değerleri - {row['shape_pt_lat']}, {row['shape_pt_lon']} - Satır atlanıyor")
                            continue
                        
                        query = (
                            "MERGE (p:ShapeNoktasi {shape_id_seq: $shape_id_seq}) "
                            "ON CREATE SET p.shape_id = $shape_id, p.lat = $lat, p.lng = $lng, p.sequence = $sequence "
                            "ON MATCH SET p.lat = $lat, p.lng = $lng"
                        )
                        session.run(query, 
                                    shape_id_seq=shape_id_seq,
                                    shape_id=shape_id,
                                    lat=lat,
                                    lng=lon,
                                    sequence=sequence)
                        
                        # Noktaları bağla
                        if sequence > 0:
                            prev_shape_id_seq = f"{shape_id}_{sequence-1}"
                            relation_query = (
                                "MATCH (p1:ShapeNoktasi {shape_id_seq: $prev_id}), "
                                "      (p2:ShapeNoktasi {shape_id_seq: $curr_id}) "
                                "MERGE (p1)-[r:SONRAKI_NOKTA {shape_id: $shape_id}]->(p2)"
                            )
                            session.run(relation_query,
                                        prev_id=prev_shape_id_seq,
                                        curr_id=shape_id_seq,
                                        shape_id=shape_id)
                        
                        count += 1
                        # Durum bilgisi
                        if count % 10000 == 0:
                            print(f"{count} shape noktası işlendi...")
                    
                    except Exception as e:
                        print(f"Hata: Shape noktası eklenirken bir sorun oluştu: {e} - Satır: {row}")
                
                print(f"Toplam {count} shape noktası, {len(shape_count)} benzersiz shape için veritabanına eklendi.")
                top_shapes = sorted(shape_count.items(), key=lambda x: x[1], reverse=True)[:5]
                print("En çok noktaya sahip 5 shape:")
                for shape_id, point_count in top_shapes:
                    print(f"  {shape_id}: {point_count} nokta")
    
    def import_routes(self, file_path):
        # Hatları yükle
        if not os.path.exists(file_path):
            print(f"Hata: {file_path} dosyası bulunamadı!")
            return

        with self.driver.session() as session:
            with open(file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                count = 0
                
                for row in csv_reader:
                    try:
                        # Gerekli sütunların varlığını kontrol et
                        if 'route_id' not in row or 'stops' not in row:
                            print(f"Uyarı: Gerekli sütunlar bulunamadı. Satır atlanıyor: {row}")
                            continue
                        
                        route_id = row['route_id']
                        direction = 'Gidiş' if route_id.endswith('0') else 'Dönüş'
                        
                        route_number = row.get('route_short_name', '')
                        route_name = row.get('route_long_name', '')
                        
                        query = (
                            "MERGE (r:Hat {route_id: $route_id}) "
                            "ON CREATE SET r.route_name = $route_name, "
                            "    r.route_number = $route_number, "
                            "    r.route_long_name = $route_long_name, "
                            "    r.route_type = $route_type, "
                            "    r.route_desc = $route_desc, "
                            "    r.route_color = $route_color, "
                            "    r.route_text_color = $route_text_color, "
                            "    r.yön = $direction "
                            "ON MATCH SET r.route_name = $route_name, "
                            "    r.route_number = $route_number, "
                            "    r.route_long_name = $route_long_name, "
                            "    r.route_type = $route_type, "
                            "    r.route_desc = $route_desc, "
                            "    r.route_color = $route_color, "
                            "    r.route_text_color = $route_text_color, "
                            "    r.yön = $direction"
                        )
                        session.run(query,
                                    route_id=route_id,
                                    route_number=route_number,
                                    route_name=route_name,
                                    route_long_name=row.get('route_long_name', ''),
                                    route_type=row.get('route_type', ''),
                                    route_desc=row.get('route_desc', ''),
                                    route_color=row.get('route_color', ''),
                                    route_text_color=row.get('route_text_color', ''),
                                    direction=direction)
                        
                        # Durak-Hat ilişkileri
                        if 'stops' in row and row['stops']:
                            stops_str = row['stops'].strip('"')
                            if stops_str:
                                stops = stops_str.split(',')
                                
                                for i, stop_id in enumerate(stops):
                                    if not stop_id or stop_id.strip() == '':
                                        continue
                                    
                                    session.run("""
                                        MATCH (h:Hat {route_id: $route_id})
                                        MATCH (d:Durak {stop_id: $stop_id})
                                        MERGE (d)-[r:GÜZERGAH_ÜZERINDE {yön: $direction, sıra: $sequence}]->(h)
                                    """, route_id=route_id, stop_id=stop_id.strip(), direction=direction, sequence=i)
                                
                                for i in range(len(stops) - 1):
                                    stop_id1 = stops[i].strip()
                                    stop_id2 = stops[i + 1].strip()
                                    
                                    if not stop_id1 or not stop_id2 or stop_id1 == '' or stop_id2 == '':
                                        continue
                                    
                                    session.run("""
                                        MATCH (s1:Durak {stop_id: $stop_id1})
                                        MATCH (s2:Durak {stop_id: $stop_id2})
                                        MERGE (s1)-[r:SONRAKI_DURAK {
                                            hat: $route_number,
                                            hat_id: $route_id,
                                            yön: $direction,
                                            sıra: $order
                                        }]->(s2)
                                    """, 
                                    stop_id1=stop_id1,
                                    stop_id2=stop_id2,
                                    route_id=route_id,
                                    route_number=route_number,
                                    direction=direction,
                                    order=i)
                        
                        count += 1
                        # Durum bilgisi
                        if count % 100 == 0:
                            print(f"{count} hat işlendi...")
                    
                    except Exception as e:
                        print(f"Hata: Hat eklenirken bir sorun oluştu: {e} - Satır: {row}")
                
                print(f"Toplam {count} hat veritabanına eklendi.")
    
    def import_schedules(self, file_path):
        # Zaman çizelgelerini yükle
        if not os.path.exists(file_path):
            print(f"Hata: {file_path} dosyası bulunamadı!")
            return

        with self.driver.session() as session:
            with open(file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                count = 0
                
                for row in csv_reader:
                    try:
                        if 'route_id' not in row:
                            print(f"Uyarı: route_id sütunu bulunamadı. Satır atlanıyor: {row}")
                            continue
                        
                        route_id = row['route_id']
                        
                        direction = row.get('direction', '')
                        if not direction:
                            if route_id.endswith('0'):
                                direction = 'Gidiş'
                            else:
                                direction = 'Dönüş'
                        
                        query = (
                            "MATCH (r:Hat {route_id: $route_id}) "
                            "SET r.weekday_times = $weekday_times, "
                            "    r.saturday_times = $saturday_times, "
                            "    r.sunday_times = $sunday_times, "
                            "    r.direction = $direction, "  # Direction bilgisini veritabanına kaydet
                            "    r.route_short_name = $route_short_name, "  # Route short name bilgisini ekle
                            "    r.schedule_notes = $schedule_notes "
                        )
                        
                        session.run(query,
                                    route_id=route_id,
                                    weekday_times=row.get('weekday_times', ''),
                                    saturday_times=row.get('saturday_times', ''),
                                    sunday_times=row.get('sunday_times', ''),
                                    schedule_notes=row.get('color_notes', ''),
                                    route_short_name=row.get('route_short_name', ''),  # route_short_name değerini ekle
                                    direction=direction)  # Direction değerini parametre olarak ekle
                        
                        count += 1
                        # Durum bilgisi
                        if count % 50 == 0:
                            print(f"{count} hat için zaman çizelgesi işlendi...")
                    
                    except Exception as e:
                        print(f"Hata: Zaman çizelgesi eklenirken bir sorun oluştu: {e} - Satır: {row}")
                
                print(f"Toplam {count} hat için zaman çizelgesi bilgileri eklendi.")
    
    def create_database_summary(self):
        # Özet bilgi göster
        with self.driver.session() as session:
            durak_sayisi = session.run("MATCH (d:Durak) RETURN COUNT(d) as count").single()["count"]
            hat_sayisi = session.run("MATCH (h:Hat) RETURN COUNT(h) as count").single()["count"]
            shape_noktasi_sayisi = session.run("MATCH (p:ShapeNoktasi) RETURN COUNT(p) as count").single()["count"]
            
            guzergah_iliskisi_sayisi = session.run("MATCH ()-[r:GÜZERGAH_ÜZERINDE]->() RETURN COUNT(r) as count").single()["count"]
            sonraki_durak_iliskisi_sayisi = session.run("MATCH ()-[r:SONRAKI_DURAK]->() RETURN COUNT(r) as count").single()["count"]
            sonraki_nokta_iliskisi_sayisi = session.run("MATCH ()-[r:SONRAKI_NOKTA]->() RETURN COUNT(r) as count").single()["count"]
            
            print("\n" + "="*50)
            print("VERİTABANI ÖZET BİLGİLERİ")
            print("="*50)
            print(f"Durak sayısı: {durak_sayisi}")
            print(f"Hat sayısı: {hat_sayisi}")
            print(f"Shape noktası sayısı: {shape_noktasi_sayisi}")
            print(f"GÜZERGAH_ÜZERINDE ilişki sayısı: {guzergah_iliskisi_sayisi}")
            print(f"SONRAKI_DURAK ilişki sayısı: {sonraki_durak_iliskisi_sayisi}")
            print(f"SONRAKI_NOKTA ilişki sayısı: {sonraki_nokta_iliskisi_sayisi}")
            
            print("\nEn çok hat geçen 5 durak:")
            result = session.run("""
            MATCH (d:Durak)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
            WITH d, COUNT(DISTINCT h) as hat_sayisi
            RETURN d.name as durak_adi, hat_sayisi
            ORDER BY hat_sayisi DESC
            LIMIT 5
            """)
            for record in result:
                print(f"  {record['durak_adi']}: {record['hat_sayisi']} hat")
            
            print("\nEn uzun güzergaha sahip 5 hat:")
            result = session.run("""
            MATCH (h:Hat)<-[r:GÜZERGAH_ÜZERINDE]-(d:Durak)
            WITH h, COUNT(d) as durak_sayisi
            RETURN h.route_name as hat_adi, h.yön as yon, durak_sayisi
            ORDER BY durak_sayisi DESC
            LIMIT 5
            """)
            for record in result:
                print(f"  Hat {record['hat_adi']} ({record['yon']}): {record['durak_sayisi']} durak")
            
            print("\nEn çok hat değiştirme imkanı olan 5 durak (potansiyel aktarma noktaları):")
            result = session.run("""
            MATCH (d:Durak)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
            WITH d, COUNT(DISTINCT h.route_name) as hat_sayisi
            RETURN d.name as durak_adi, hat_sayisi
            ORDER BY hat_sayisi DESC
            LIMIT 5
            """)
            for record in result:
                print(f"  {record['durak_adi']}: {record['hat_sayisi']} farklı hat")
            
            print("="*50)


def main():
    # Program başlat
    URI = "bolt://localhost:7687"
    USER = "neo4j"
    PASSWORD = "baranbaran"
    
    STOPS_FILE = "veri/stops.txt"
    SHAPES_FILE = "veri/shapes.txt"
    ROUTES_FILE = "veri/routes.txt"
    SCHEDULES_FILE = "veri/schedules.txt"
    
    try:
        # Onay al
        confirm = input("Veritabanı tamamen temizlenecek ve yeniden yapılandırılacak. Devam etmek istiyor musunuz? (e/h): ")
        if confirm.lower() != 'e':
            print("İşlem iptal edildi.")
            return
        
        # DB'ye bağlan
        db = Neo4jDatabase(URI, USER, PASSWORD)
        
        # Temizle
        db.clear_database()
        
        # Kısıtlamalar
        db.create_constraints()
        
        # Veri yükleme
        print("\n1. Durak verilerini yükleme...")
        db.import_stops(STOPS_FILE)
        
        print("\n2. Shape verilerini yükleme...")
        db.import_shapes(SHAPES_FILE)
        
        print("\n3. Hat ve güzergah verilerini yükleme...")
        db.import_routes(ROUTES_FILE)
        
        print("\n4. Hat zaman çizelgelerini yükleme...")
        db.import_schedules(SCHEDULES_FILE)
        
        # İndeksler
        db.create_indexes()
        
        # Özet
        db.create_database_summary()
        
        # Kapat
        db.close()
        print("\nİşlem başarıyla tamamlandı!")
        
    except Exception as e:
        print(f"\nHata: {e}")
        print("İşlem sırasında bir hata oluştu!")
        sys.exit(1)


if __name__ == "__main__":
    main()