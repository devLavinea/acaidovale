import Admin from './Admin'
import Header from './components/header'
import Cta from './components/cta'
import Footer from './components/footer'
import Cart from './components/cart'
import { CartProvider } from './cart'

function PublicApp(){return <CartProvider><Header/><Cta/><Footer/><Cart/></CartProvider>}
function App(){const isAdmin=window.location.pathname==='/adm'||window.location.pathname.startsWith('/adm/');return isAdmin?<Admin/>:<PublicApp/>}
export default App
