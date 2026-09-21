import Items from "./Items.jsx"
import { useTranslation } from "react-i18next"
import {PRODUCTS,RESOURCES,COMPANY,SUPPORT} from "./MenuFooter.jsx"



const ItemsContener = () => {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:px-8 px-5 py-16 ">
    <Items  Links={PRODUCTS} title={t('footer.cours_de_justice')}/>
    <Items Links={RESOURCES} title={t('footer.organes_legislatifs')}/>
    <Items Links={SUPPORT} title={t('footer.contacts')}/>
    <Items Links={COMPANY} title={t('footer.milieu_academique')}/>
    </div>
  )

}

export default ItemsContener
