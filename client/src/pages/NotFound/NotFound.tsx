import { Link } from 'react-router-dom';
import { Button } from '@client/src/components/ui/button';

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl font-bold text-muted-foreground">404</div>
      <p className="text-muted-foreground">页面不存在或已被移除</p>
      <Button asChild>
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
};

export default NotFound;
