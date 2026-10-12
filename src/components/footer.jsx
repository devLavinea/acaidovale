import { FaLocationDot } from "react-icons/fa6";
import { IoLogoWhatsapp } from "react-icons/io";
import { MdEmail } from "react-icons/md";
import { SiIfood } from "react-icons/si";
import { useEffect, useState } from "react";
import logo from "../assets/logo.webp";
import { loadSettings, loadSettingsFromFirebase } from "../data";

function Footer() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    let active = true;
    loadSettingsFromFirebase().then((remote) => {
      if (active && remote) setSettings(remote);
    });
    return () => {
      active = false;
    };
  }, []);
  const store = settings.store || {};
  const phone = String(store.contact || "").replace(/\D/g, "");
  const whatsapp = phone
    ? phone.startsWith("55")
      ? phone
      : `55${phone}`
    : "5574999630180";
  const address =
    store.addressText ||
    [
      store.street,
      store.number,
      store.complement,
      store.neighborhood,
      store.city,
      store.state,
    ]
      .filter(Boolean)
      .join(", ");
  const ifood =
    store.ifoodUrl ||
    "https://www.ifood.com.br/delivery/juazeiro-ba/acai-do-vale-dom-jose-rodrigues/fd6f1b76-44ea-40c3-9fe4-fb3616b952e3";
  return (
    <footer id="footer" className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src={logo} alt="Açaí do Vale" />
          <p>
            <br></br>Seu açaí, do seu jeito. 💜
          </p>
        </div>
        <div className="footer-contact">
          <span className="footer-label">FALE COM A GENTE</span>
          <a
            href={`https://api.whatsapp.com/send?phone=${whatsapp}&text=Vim%20pelo%20site!`}
            target="_blank"
            rel="noreferrer"
          >
            <IoLogoWhatsapp /> {store.contact || "(74) 9 9963-0180"}
          </a>
          <a href={ifood} target="_blank" rel="noreferrer">
            <SiIfood /> Açaí do Vale no iFood
          </a>
          <a href="mailto:acaidovalee@gmail.com">
            <MdEmail /> acaidovalee@gmail.com
          </a>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "Açaí do Vale, Juazeiro-BA")}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaLocationDot /> {address || "Endereço não cadastrado"}
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© Açaí do Vale</span>
        <span>Desenvolvido por Lavinea Souza.</span>
      </div>
    </footer>
  );
}

export default Footer;
