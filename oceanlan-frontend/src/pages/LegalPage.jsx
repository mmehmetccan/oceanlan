// src/pages/LegalPage.jsx
import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const LegalPage = () => {
  const { type } = useParams(); // URL'den parametreyi al (privacy, terms, cookies, guidelines)
  const navigate = useNavigate();

  // Sayfa açıldığında en üste kaydır
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [type]);

  // İçerik Sözlüğü: Her sayfa tipi için başlık ve detaylı içerik
  const contents = {
    // 🟢 GİZLİLİK POLİTİKASI (Detaylandırıldı)
    privacy: {
      title: 'Gizlilik Politikası',
      updatedAt: 'Son Güncelleme: 20 Ekim 2023',
      body: (
        <>
            <p>OceanLan ("biz", "bize" veya "bizim") olarak gizliliğinize önem veriyoruz. Bu Gizlilik Politikası, hizmetlerimizi kullandığınızda bilgilerinizin nasıl toplandığını, kullanıldığını ve paylaşıldığını açıklar.</p>

            <h4>1. Topladığımız Bilgiler</h4>
            <p>Hizmetlerimizi sağlamak ve geliştirmek için aşağıdaki türde bilgileri topluyoruz:</p>
            <ul>
                <li><strong>Hesap Bilgileri:</strong> Kayıt olurken sağladığınız kullanıcı adı, e-posta adresi ve şifre (şifrelenmiş olarak).</li>
                <li><strong>İletişim İçeriği:</strong> Gönderdiğiniz mesajlar, yüklediğiniz dosyalar ve oluşturduğunuz sunucu bilgileri.</li>
                <li><strong>Kullanım Verileri:</strong> IP adresi, cihaz türü, tarayıcı bilgileri ve erişim zamanları gibi teknik veriler.</li>
            </ul>

            <h4>2. Bilgilerin Kullanımı</h4>
            <p>Topladığımız bilgileri şu amaçlarla kullanırız:</p>
            <ul>
                <li>Hizmetleri sağlamak, sürdürmek ve iyileştirmek.</li>
                <li>Kullanıcı hesaplarını yönetmek ve güvenliğini sağlamak.</li>
                <li>Teknik sorunları tespit etmek ve gidermek.</li>
                <li>Yasal yükümlülüklere uymak.</li>
            </ul>

            <h4>3. Bilgilerin Paylaşımı</h4>
            <p>Kişisel verilerinizi üçüncü taraflara satmıyoruz. Bilgilerinizi yalnızca yasal zorunluluklar (mahkeme kararı vb.) durumunda veya hizmet sağlayıcılarımızla (sunucu barındırma vb.) sözleşmelerimiz çerçevesinde paylaşabiliriz.</p>

            <h4>4. Veri Güvenliği</h4>
            <p>Verilerinizi korumak için endüstri standardı şifreleme ve güvenlik önlemleri kullanıyoruz. Ancak, internet üzerinden yapılan hiçbir iletimin %100 güvenli olmadığını unutmayın.</p>

            <h4>5. İletişim</h4>
            <p>Bu politika hakkında sorularınız varsa, lütfen bizimle iletişime geçin: <a href="mailto:support@oceanlan.com" style={{color:'#5865f2'}}>support@oceanlan.com</a></p>
        </>
      )
    },

    // 🟢 KULLANIM KOŞULLARI (Detaylandırıldı)
    terms: {
      title: 'Kullanım Koşulları',
      updatedAt: 'Son Güncelleme: 20 Ekim 2023',
      body: (
        <>
            <p>Lütfen OceanLan uygulamasını kullanmadan önce bu Kullanım Koşullarını ("Koşullar") dikkatlice okuyun. Hizmetlerimize erişerek veya kullanarak bu Koşulları kabul etmiş sayılırsınız.</p>

            <h4>1. Hesap Oluşturma ve Güvenlik</h4>
            <p>Hizmetlerimizi kullanmak için bir hesap oluşturmanız gerekebilir. Hesabınızın güvenliğini sağlamak sizin sorumluluğunuzdadır. Şifrenizi kimseyle paylaşmamalısınız. Hesabınızla yapılan tüm işlemlerden siz sorumlu tutulursunuz.</p>

            <h4>2. Kabul Edilebilir Kullanım</h4>
            <p>Hizmetlerimizi kullanırken aşağıdaki eylemleri gerçekleştirmemeyi kabul edersiniz:</p>
            <ul>
                <li>Yasa dışı, zararlı, tehditkar, hakaret içeren veya rahatsız edici içerik paylaşmak.</li>
                <li>Diğer kullanıcıların hizmeti kullanmasını engellemek veya sisteme zarar vermek.</li>
                <li>Sistemi tersine mühendislik (reverse engineering) yoluyla çözmeye çalışmak.</li>
                <li>Spam yapmak veya izinsiz reklam faaliyetlerinde bulunmak.</li>
            </ul>

            <h4>3. İçerik Mülkiyeti</h4>
            <p>Hizmetlerimiz üzerinde paylaştığınız içeriğin (metin, dosya, resim) mülkiyeti size aittir. Ancak, bu içeriği hizmetlerimizde göstermemiz, saklamamız ve iletmemiz için bize dünya çapında, telifsiz bir lisans vermiş olursunuz.</p>

            <h4>4. Fesih</h4>
            <p>Bu Koşulları ihlal etmeniz durumunda, hesabınızı önceden haber vermeksizin askıya alma veya sonlandırma hakkımızı saklı tutarız.</p>

            <h4>5. Sorumluluk Reddi</h4>
            <p>Hizmetlerimiz "olduğu gibi" sunulmaktadır. OceanLan, hizmetlerin kesintisiz veya hatasız olacağını garanti etmez.</p>
        </>
      )
    },

    // 🟢 ÇEREZ POLİTİKASI
    cookies: {
      title: 'Çerez (Cookie) Politikası',
      updatedAt: 'Son Güncelleme: 15 Eylül 2023',
      body: (
        <>
            <p>Bu Çerez Politikası, OceanLan web sitesini ve uygulamasını ziyaret ettiğinizde çerezleri ve benzer teknolojileri nasıl kullandığımızı açıklar.</p>
            <h4>1. Çerez Nedir?</h4>
            <p>Çerezler, bir web sitesini ziyaret ettiğinizde cihazınıza kaydedilen küçük metin dosyalaridır.</p>
            <h4>2. Kullandığımız Çerez Türleri</h4>
            <ul>
                <li><strong>Zorunlu Çerezler:</strong> Uygulamanın çalışması için gereklidir (örn: oturum açma bilgileri).</li>
                <li><strong>İşlevsel Çerezler:</strong> Tercihlerinizi (dil, tema vb.) hatırlamamızı sağlar.</li>
                <li><strong>Analitik Çerezler:</strong> Uygulamanın nasıl kullanıldığını anlamamıza yardımcı olur.</li>
            </ul>
            <h4>3. Çerezleri Yönetme</h4>
            <p>Tarayıcı ayarlarınızı kullanarak çerezleri engelleyebilir veya silebilirsiniz. Ancak bu, uygulamanın bazı özelliklerinin çalışmamasına neden olabilir.</p>
        </>
      )
    },

    // 🟢 TOPLULUK KURALLARI
    guidelines: {
      title: 'Topluluk Kuralları',
      updatedAt: 'Son Güncelleme: 01 Ocak 2024',
      body: (
        <>
            <p>OceanLan, herkes için güvenli ve keyifli bir ortam olmayı hedefler. Bu kurallar, topluluğumuzun standartlarını belirler.</p>
            <h4>1. Saygı ve Nezaket</h4>
            <p>Her kullanıcıya saygılı davranın. Taciz, zorbalık, nefret söylemi ve ayrımcılık (ırk, din, cinsiyet vb.) kesinlikle yasaktır.</p>
            <h4>2. Güvenlik</h4>
            <p>Kendisinin veya başkalarının kişisel bilgilerini (doxing) paylaşmak yasaktır. Şiddeti teşvik eden içerikler paylaşılamaz.</p>
            <h4>3. Uygunsuz İçerik</h4>
            <p>Cinsel içerikli (+18) materyallerin, yasa dışı ürünlerin veya zararlı yazılımların paylaşımı yasaktır.</p>
            <h4>4. Spam ve Dolandırıcılık</h4>
            <p>Kullanıcıları dolandırmaya yönelik girişimler, phishing linkleri veya toplu spam mesajlar gönderilemez.</p>
        </>
      )
    }
  };

  const currentContent = contents[type];

  // Geçersiz bir tip gelirse
  if (!currentContent) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#313338',
            color: '#fff'
        }}>
            <h2>Sayfa Bulunamadı</h2>
            <button
                onClick={() => navigate('/dashboard/feed')}
                style={{
                    marginTop: '20px',
                    padding: '10px 20px',
                    background: '#5865f2',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'white',
                    cursor: 'pointer'
                }}
            >
                Ana Sayfaya Dön
            </button>
        </div>
    );
  }

  return (
    <div className="legal-page-wrapper" style={{ backgroundColor: '#313338', minHeight: '100vh', color: '#dbdee1', fontFamily: 'sans-serif' }}>

      {/* Üst Bar (Header) */}
      <div className="legal-header" style={{
          padding: '20px 40px',
          borderBottom: '1px solid #1f2023',
          display:'flex',
          alignItems:'center',
          gap:'20px',
          background:'#2b2d31',
          position: 'sticky',
          top: 0,
          zIndex: 10
      }}>
        <button
            onClick={() => navigate(-1)}
            style={{
                background:'transparent',
                border:'none',
                color:'#b9bbbe',
                cursor:'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s'
            }}
            title="Geri Dön"
            onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
            onMouseOut={(e) => e.currentTarget.style.color = '#b9bbbe'}
        >
            <ArrowLeftIcon width={28} />
        </button>

        <div>
            <h2 style={{margin:0, fontSize:'22px', color: '#f2f3f5'}}>{currentContent.title}</h2>
            {currentContent.updatedAt && (
                <span style={{fontSize: '12px', color: '#949ba4'}}>{currentContent.updatedAt}</span>
            )}
        </div>
      </div>

      {/* İçerik Alanı */}
      <div className="legal-content" style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '40px 24px',
          lineHeight: '1.7',
          fontSize: '15px'
      }}>
        <style>{`
            .legal-content h4 { color: #f2f3f5; margin-top: 30px; margin-bottom: 10px; font-size: 18px; }
            .legal-content p { margin-bottom: 15px; color: #b5bac1; }
            .legal-content ul { margin-bottom: 15px; padding-left: 20px; color: #b5bac1; }
            .legal-content li { margin-bottom: 5px; }
            .legal-content strong { color: #dbdee1; }
        `}</style>

        {currentContent.body}
      </div>

    </div>
  );
};

export default LegalPage;