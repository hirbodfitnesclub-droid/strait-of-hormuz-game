package ir.hormuz.sovereign;

import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public final class HarborRecoveryActivity extends AppCompatActivity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.harbor_recovery);
        findViewById(R.id.retry_harbor).setOnClickListener(button -> {
            startActivity(new Intent(this, MainActivity.class));
            finish();
        });
    }
}
