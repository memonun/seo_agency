import FormContainer from '../components/FormContainer'

export default function SEOModule({ user }) {
  return (
    <div className="module-page">
      <div className="module-header">
        <h1>SEO Module</h1>
        <p className="module-description">Keyword research, domain analytics, and content strategy tools</p>
      </div>
      <FormContainer user={user} />
    </div>
  )
}
