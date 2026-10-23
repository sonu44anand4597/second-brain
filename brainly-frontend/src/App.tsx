import './App.css'
import { Button } from './components/ui/Button'
import { PlusIcon } from './icons/PlusIcons';

function App () {


  return (
    <>
     <Button startIcon={<PlusIcon/>} variant='primary' text='Share'/>
     <Button variant='secondary' text='Add content'/>
    
    </>
  )
}

export default App;