import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PersonalDetails } from '../features/profile/PersonalDetails';

/** My profile: the signed-in employee's own personal details. */
export function MyProfile() {
  const { me } = useAuth();
  const id = me?.user.employeeId;
  return (
    <div className="stack-4">
      <PageHeader
        title="My profile"
        description={<>Keep your emergency contacts and addresses up to date. HR checks changes to nominees, education and previous employment.{id && <> See also <Link to={`/employees/${id}`}>your employee record</Link>.</>}</>}
      />
      {id ? <PersonalDetails employeeId={id} /> : <EmptyState title="Your account is not linked to an employee record." />}
    </div>
  );
}
