<template>
  <el-container>
    <t-side></t-side>

    <el-container class="main-container">
      <t-header></t-header>

      <t-main></t-main>

      <el-footer></el-footer>
    </el-container>
  </el-container>
</template>

<script lang="ts" setup>
  import THeader from "./header/index.vue";
  import TSide from "./side/index.vue";
  import TMain from "./main/index.vue";

  //   import { UserMapper } from "@/database/orm/mapper/UserMapper";
  //   import { User } from "@/database/orm/mapper/User";
  // import { QueryBuilder } from "@/database/orm/query/QueryBuilder";

  //   onMounted(async () => {
  //     debugger;

  //     try {
  //       const userMapper = new UserMapper();

  //       // let user1 = new User();
  //       // user1.age = 13;
  //       // user1.id = 101;
  //       // user1.username = "amy";

  //       // let user2 = new User();
  //       // user2.age = 12;
  //       // user2.id = 102;
  //       // user2.username = "jimi";

  //       // let user3 = new User();
  //       // user3.age = 14;
  //       // user3.id = 103;
  //       // user3.username = "tom";

  //       // const res1 = await userMapper.insert(user1);

  //       // const res2 = await userMapper.batchInsert([user2, user3]);

  //       const builder = new QueryBuilder<User>()
  //         .like("username", "t")
  //         .and(q => q.gt("age", 10).lt("age", 20))
  //         .orderByDesc("userId")
  //         .limit(10);

  //        const res = await userMapper.query(builder)
  //       // const count = await userMapper.count();

  //       // const list = await userMapper.selectList();

  //       // const user = await userMapper.selectById(10001)

  //       console.log("测试", res);
  //     } catch (err) {
  //       console.error("错误", err);
  //     }
  //   });
</script>

<style lang="scss" scoped>
  .el-container {
    height: 100%;
    z-index: 1;

    .el-footer {
      height: 0px;
    }
  }

  .main-container {
    border: var(--main-border-color) solid 1px;
  }
</style>
