import { ArrowLeft, Button, EmptyState, Search } from "@sylis/components";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="standalone">
      <EmptyState
        icon={Search}
        title="页面不存在"
        description="这个地址没有对应页面。"
        action={
          <Button icon={ArrowLeft} onClick={() => navigate(-1)}>
            返回
          </Button>
        }
      />
    </main>
  );
}
