import React from 'react';
// Sidebar.css içindeki modal stillerini kullanıyoruz.
// Eğer farklı bir CSS dosyası kullanıyorsan yolunu ona göre değiştirebilirsin.
import '../../styles/Sidebar.css';

const LegalModal = ({ type, onClose }) => {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Gizlilik Politikası' : 'Kullanım Koşulları';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content legal-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-header">
            <h3>{title}</h3>
            <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="legal-modal-body">
            {isPrivacy ? (
                <>
                    <h4>1. Veri Toplama</h4>
                    <p>OceanLan olarak hizmetlerimizi sağlamak için kullanıcı adı, e-posta ve IP adresi gibi temel verileri topluyoruz. Mesajlaşma içerikleriniz güvenli sunucularımızda saklanmaktadır.</p>

                    <h4>2. Veri Kullanımı</h4>
                    <p>Toplanan veriler sadece uygulama deneyimini iyileştirmek, güvenliği sağlamak ve teknik sorunları gidermek amacıyla kullanılır. Verileriniz üçüncü taraflarla satılmaz.</p>

                    <h4>3. Çerezler</h4>
                    <p>Oturumunuzun açık kalması ve tercihlerin hatırlanması için yerel depolama ve çerez teknolojilerini kullanıyoruz.</p>

                    <h4>4. İletişim</h4>
                    <p>Gizlilikle ilgili sorularınız için: support@oceanlan.com</p>
                </>
            ) : (
                <>
                    <h4>1. Kabul</h4>
                    <p>OceanLan uygulamasını kullanarak bu koşulları kabul etmiş sayılırsınız. Kurallara uymayan hesaplar askıya alınabilir.</p>

                    <h4>2. Kullanıcı Davranışları</h4>
                    <p>Tehdit, taciz, yasa dışı içerik paylaşımı ve sunucu güvenliğini tehlikeye atacak davranışlar yasaktır. Her kullanıcı kendi paylaştığı içerikten sorumludur.</p>

                    <h4>3. Hesap Güvenliği</h4>
                    <p>Şifrenizin güvenliğini sağlamak sizin sorumluluğunuzdadır. Şüpheli bir durum fark ederseniz hemen bize bildirin.</p>

                    <h4>4. Hizmet Değişiklikleri</h4>
                    <p>OceanLan, hizmet özelliklerini haber vermeksizin değiştirme veya sonlandırma hakkını saklı tutar.</p>
                </>
            )}
        </div>
      </div>
    </div>
  );
};

export default LegalModal;