import { FaLocationDot } from 'react-icons/fa6'
import { IoLogoWhatsapp } from 'react-icons/io'
import { MdEmail } from 'react-icons/md'
import { SiIfood } from 'react-icons/si'
import logo from '../assets/logo.png'

function Footer() {
  return (
    <footer id="footer" className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src={logo} alt="Açaí do Vale" />
          <p><br></br>
            Seu açaí, do seu jeito. 💜</p>
        </div>
        <div className="footer-contact">
          <span className="footer-label">FALE COM A GENTE</span>
          <a href="https://api.whatsapp.com/send?phone=5574999630180&text=Vim%20pelo%20Site!%20Me%20encaminha%20o%20card%C3%A1pio,%20por%20favor!" target="_blank" rel="noreferrer"><IoLogoWhatsapp /> (74) 9 9963-0180</a>
          <a href="https://www.ifood.com.br/delivery/juazeiro-ba/acai-do-vale-dom-jose-rodrigues/fd6f1b76-44ea-40c3-9fe4-fb3616b952e3" target="_blank" rel="noreferrer"><SiIfood /> Açaí do Vale no iFood</a>
          <a href="mailto:acaidovalee@gmail.com"><MdEmail /> acaidovalee@gmail.com</a>
          <a href="https://maps.app.goo.gl/nQmVQaQE4JE2aWLW8" target="_blank" rel="noreferrer"><FaLocationDot /> Avenida Beta, Caminho 65, 05 · Dom José Rodrigues · Juazeiro-BA</a>
        </div>
      </div>
      <div className="footer-bottom"><span>© Açaí do Vale</span><span>Feito para deixar seu dia mais gostoso.</span></div>
    </footer>
  )
}

export default Footer
