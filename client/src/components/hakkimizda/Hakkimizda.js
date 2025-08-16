import React from 'react';
import { Container, Row, Col, Card, Image } from 'react-bootstrap';
import { FaUniversity, FaEnvelope, FaPhone, FaUserGraduate, FaFileAlt } from 'react-icons/fa';
import './Hakkimizda.scss';

// Simüle edilmiş profil resimleri, bunları assets klasörüne ekleyebilirsiniz.
import baranAvatar from '../../assets/images/vesika.png'; 
import umutAvatar from '../../assets/images/adil.jpg';

const Hakkimizda = () => {
  return (
    <div className="hakkimizda-page">
      <Container>
        <div className="page-header text-center mb-4">
            <Image src="https://upload.wikimedia.org/wikipedia/tr/1/1a/Kouyenilogo.png?20131216005730" alt="Kocaeli Üniversitesi Logo" className="university-logo" />
            <h1 className="university-title">Kocaeli Üniversitesi</h1>
            <p className="lead faculty-info">Mühendislik Fakültesi</p>
            <p className="lead faculty-info">Bilgisayar Mühendisliği Bölümü</p>
            <p className="lead thesis-info">Lisans Tezi</p>
        </div>

        <Row className="justify-content-center mb-4">
            <Col md={10}>
                <Card className="project-summary-card">
                    <Card.Body>
                        <Card.Title className="text-center"><FaFileAlt className="me-2" />Tez Özeti</Card.Title>
                        <hr />
                        <Card.Text>
                            Bu proje, Kocaeli şehrinin toplu taşıma ağını dijitalleştirmek ve kullanıcılara interaktif bir ulaşım rehberi sunmak amacıyla geliştirilmiştir. Sistemin kalbinde, duraklar, otobüs hatları ve bu hatların güzergahları arasındaki karmaşık ilişkileri modellemek için tasarlanmış bir <strong>Neo4j graf veritabanı</strong> bulunmaktadır. Bu modern veritabanı yaklaşımı, özellikle başlangıç ve varış noktaları arasında en uygun rotayı bulma gibi sorgular için yüksek performans ve esneklik sağlamaktadır.
                        </Card.Text>
                        <Card.Text>
                            Uygulama, kullanıcılara şehirdeki tüm otobüs hatlarını ve bu hatların duraklarını görüntüleme, belirli bir durağın detaylarını (örneğin, o duraktan geçen hatlar) inceleme ve en önemlisi, "Nasıl Giderim?" özelliği ile iki nokta arasında nasıl seyahat edebileceklerini öğrenme imkanı sunar. React ile geliştirilen dinamik ve kullanıcı dostu arayüz, arka planda Node.js/Express ile çalışan servislerle iletişim kurarak veritabanından aldığı güncel bilgileri kullanıcıya sunar. Bu proje, Kocaeli halkı ve şehri ziyaret edenler için toplu taşımayı daha erişilebilir ve planlanabilir kılmayı hedeflemektedir.
                        </Card.Text>
                    </Card.Body>
                </Card>
            </Col>
        </Row>

        <div className="text-center mb-4 mt-5">
            <h2 className="section-title">Lisans Tez Danışmanı</h2>
        </div>
        <Row className="justify-content-center mb-4">
            <Col md={5}>
                <Card className="student-card text-center">
                    <Image src="https://avesis.kocaeli.edu.tr/user/image/1867" roundedCircle className="student-avatar" />
                    <Card.Body>
                        <Card.Title>Doç. Dr. Alev Mutlu</Card.Title>
                        <Card.Subtitle className="mb-2 text-muted">Öğretim Üyesi</Card.Subtitle>
                        <hr />
                        <div className="contact-info">
                            <p><FaEnvelope className="me-2" /> alev.mutlu@kocaeli.edu.tr</p>
                            <p><FaPhone className="me-2" /> +90 262 303 3565</p>
                        </div>
                    </Card.Body>
                </Card>
            </Col>
        </Row>

        <div className="text-center mb-4 mt-5">
            <h2 className="section-title">Lisans Tez Öğrencileri</h2>
        </div>
        <Row className="justify-content-center">
          <Col md={5} className="mb-4">
            <Card className="student-card text-center">
              <Image src={baranAvatar} roundedCircle className="student-avatar" />
              <Card.Body>
                <Card.Title>Baran Güzelgül</Card.Title>
                <Card.Subtitle className="mb-2 text-muted">190201036</Card.Subtitle>
                <hr />
                <div className="contact-info">
                  <p><FaEnvelope className="me-2" /> 190201036@kocaeli.edu.tr</p>
                  <p><FaPhone className="me-2" /> +90 553 715 72 23</p>
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={5} className="mb-4">
            <Card className="student-card text-center">
              <Image src={umutAvatar} roundedCircle className="student-avatar" />
              <Card.Body>
                <Card.Title>Adil Umut Tuncer</Card.Title>
                <Card.Subtitle className="mb-2 text-muted">190201079</Card.Subtitle>
                <hr />
                <div className="contact-info">
                  <p><FaEnvelope className="me-2" /> 190201079@kocaeli.edu.tr</p>
                  <p><FaPhone className="me-2" /> +90 532 597 72 20</p>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Hakkimizda; 