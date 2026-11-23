import { ButtonLink } from '../components/Button';
import { PageHeader } from '../components/PageHeader';

export function NotFound() {
  return (
    <div className="stack-4">
      <PageHeader title="Page not found" description="This page does not exist, or it is not part of this installation." />
      <div><ButtonLink to="/" variant="primary">Go to dashboard</ButtonLink></div>
    </div>
  );
}

export function Forbidden() {
  return (
    <div className="stack-4">
      <PageHeader title="You do not have access to this page" description="Ask your administrator if you need it." />
      <div><ButtonLink to="/" variant="primary">Go to dashboard</ButtonLink></div>
    </div>
  );
}
