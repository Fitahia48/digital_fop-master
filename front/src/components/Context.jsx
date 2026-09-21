import React, { createContext, useState } from 'react'
export const userContext = createContext(
    {
        user:{},
        setUser:() => null,
        isAdmin: false,
        setIsAdmin: () => null,
        selectedDomaine: null,
        setSelectedDomaine: () => null,
    }
)

function Context({children}) {
    const [user, setUser] = useState({})
    const [isAdmin, setIsAdmin] = useState(false)
    const [selectedDomaine, setSelectedDomaine] = useState(null);
  return (
   <>
   <userContext.Provider value={{user, setUser, isAdmin, setIsAdmin, selectedDomaine, setSelectedDomaine}}>
        {children}
   </userContext.Provider>
   </>
  )
}

export default Context