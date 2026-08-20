"""Public-safe project-authored semantic seeds for the R29B2M-R1 generator.

The seed catalogue is source code, not generated dataset output.  It is kept
separate from eval-v2, and this module never opens an evaluation file.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SemanticSeed:
    seed_id: str
    bucket: str
    capability: str
    variation_kind: str
    messages: tuple[str, ...]
    base_target: str


def _parse(bucket: str, raw: str) -> list[SemanticSeed]:
    seeds = []
    for line in raw.strip().splitlines():
        seed_id, capability, kind, messages, target = line.split("|", 4)
        seeds.append(SemanticSeed(seed_id, bucket, capability, kind, tuple(messages.split("~")), target))
    if len(seeds) != 40:
        raise ValueError(f"semantic_seed_bucket_requires_40:{bucket}:{len(seeds)}")
    return seeds


ORDINARY = r"""
ord_00|daily_food_answer|ordinary|隔夜米饭怎么热比较均匀？|隔夜米饭先拨松、加一点水再盖着加热，中途翻一次，会比直接烤干稳妥。
ord_01|daily_food_answer|ordinary|青菜买多了，怎么放到明天？|青菜去掉烂叶，表面保持干爽，再用纸包好冷藏；别洗湿后闷在塑料袋里。
ord_02|daily_food_answer|ordinary|煮面总是粘在一起，先改哪一步？|面条下锅后尽快拨散，水重新滚起前再轻轻搅两次，通常就不容易结成一团。
ord_03|daily_food_answer|ordinary|切开的苹果怎么少变色？|切开的苹果可以薄薄沾一层淡盐水或柠檬水，再沥干密封，颜色会慢一点变深。
ord_04|daily_food_answer|ordinary|冷冻馒头怎么蒸不发硬？|冷冻馒头不用久解冻，表面喷一点水后冷水上锅，蒸透再焖一两分钟。
ord_05|daily_food_answer|ordinary|汤太咸了能怎么补救？|先加无盐的水或原汤稀释，再补一点蔬菜；别靠大量糖去盖住咸味。
ord_06|daily_food_answer|ordinary|香蕉熟得太快，怎么放？|把香蕉拆开、避开热源，暂时别和苹果放一起；已经很熟的可以去皮冷冻。
ord_07|daily_food_answer|ordinary|泡燕麦用冷水还是热水？|想马上吃就用热水，想隔夜准备可用冷液体密封冷藏；两种都要留意保存时间。
ord_08|daily_food_answer|ordinary|鸡蛋壳裂了一点还能煮吗？|如果只是刚碰裂且一直冷藏，可尽快彻底煮熟；来源和存放情况不清楚就别冒险。
ord_09|daily_food_answer|ordinary|做沙拉怎么避免叶子出水？|叶子洗后先充分沥干，酱汁临吃前再拌，盐也别太早放，口感会清爽些。
ord_10|household_answer|ordinary|白鞋沾了干泥，怎么清理？|先等泥完全干，再用软刷刷掉浮土；余下的印子用少量温和清洁液局部擦。
ord_11|household_answer|ordinary|毛衣晾干后肩膀鼓包怎么办？|把毛衣平放，轻轻整理肩线并稍微回潮，之后改用平铺晾干，别长期挂在细衣架上。
ord_12|household_answer|ordinary|木桌上有一圈水印，先做什么？|先用干布吸干并让桌面通风，确认表层材质后再处理；不要一开始就用强溶剂擦。
ord_13|household_answer|ordinary|窗帘不拆下来怎么除灰？|先关窗，用吸尘器低档配软刷从上往下走一遍，边角再用干净微湿布轻擦。
ord_14|household_answer|ordinary|钥匙总找不到，怎么改习惯？|在进门处固定一个小盘或挂钩，回家第一步就放进去，比每次临时找位置可靠。
ord_15|household_answer|ordinary|纸质书受潮卷边了怎么办？|先移到干燥通风处，夹入吸水纸并轻压；别用高温直吹，以免纸张变形更明显。
ord_16|household_answer|ordinary|手机照片太乱，先怎么分？|先按月份粗分，再只建少量主题相册；重复和模糊照片最后集中清理，会省很多来回。
ord_17|household_answer|ordinary|雨伞收起来总有味道，怎么办？|用后把伞完全撑开晾干，伞套也要通风；已经有味道可用清水擦净后再阴干。
ord_18|household_answer|ordinary|小房间晚上怎么留一盏柔和的灯？|把低亮度暖光灯放在视线侧后方，避免直照眼睛；能调光的话先从较低亮度开始。
ord_19|household_answer|ordinary|玻璃杯贴纸撕后有胶，怎么去？|先用温水软化，再用少量食用油揉开残胶，最后用洗洁精把油膜洗净。
ord_20|daily_acknowledgement|conversation|我终于把拖了两周的表填完了。|那件一直挂着的事终于落地了，今晚可以少惦记一件。
ord_21|daily_acknowledgement|conversation|我刚把丢的耳机找回来了。|原来只是暂时躲起来了，找回来就好，省得再买一副。
ord_22|daily_acknowledgement|conversation|今天的会比预想早结束。|白捡回来一点时间，哪怕只安静坐会儿也挺值。
ord_23|daily_acknowledgement|conversation|我决定不去那个聚会了。|决定下来就行，不去也不用再给自己找一大串理由。
ord_24|daily_acknowledgement|conversation|雨停了，我准备出去走走。|正好趁空气还凉一点出去，回来前别忘了看一眼云。
ord_25|emotional_acknowledgement|conversation|今天一直被人催，我有点烦。|一直被推着走确实很磨人，先让自己慢半拍也没关系。
ord_26|emotional_acknowledgement|conversation|期待的电影没赶上，挺失落。|期待落空的时候，难受的不只是少看一场电影，这点失落很正常。
ord_27|emotional_acknowledgement|conversation|刚才说错话，现在想起来还尴尬。|脑子会反复重播那一刻，但别人往往没记得那么久，先别继续惩罚自己。
ord_28|emotional_acknowledgement|conversation|计划突然取消，我一下不知道干什么。|空出来的时间来得太突然，会有点悬着；先做一件很小的事就好。
ord_29|emotional_acknowledgement|conversation|忙了一天还是没做完，心里堵。|做不完不等于今天全白费了，先把已经完成的那一段算回来。
ord_30|greeting|conversation|早，我刚泡好茶。|早。茶还热着的时候，今天看起来没那么急。
ord_31|greeting|conversation|晚上好，我刚到家。|晚上好。门关上了，外面的那一段先放在外面吧。
ord_32|greeting|conversation|嗨，我又来聊两句。|来吧。两句也够，不必先想好一个大问题。
ord_33|greeting|conversation|午安，今天有点安静。|午安。安静一点的日子，也可以什么都不急着填满。
ord_34|greeting|conversation|我回来啦。|回来就好。先坐稳，再说今天要聊什么。
ord_35|greeting|conversation|周末好，外面太阳很亮。|周末好。光这么足，哪怕只走到门口也像换了个场景。
ord_36|greeting|conversation|睡前来打个招呼。|晚安之前的招呼收到。剩下的话可以留到明天。
ord_37|greeting|conversation|好久没打开这里了。|隔了一阵也没关系，重新说第一句就算接上了。
ord_38|greeting|conversation|今天第一次来，先说声你好。|你好。直接从眼前这件事开始就行，不用先学会怎么问。
ord_39|greeting|conversation|刚忙完，来喘口气。|那就先喘口气。这里不催你立刻把下一件事说清楚。
"""

FOLLOW_REFERENT = r"""
ref_00|follow_up|follow|切开的法棍怎么留到明早？~切面包好后放进密封袋，室温留一晚。~早上怎么让外皮脆一点？|表面轻喷一点水，再用烤箱短时间回烤；边缘变脆就取出，别一直烤到里面发干。
ref_01|follow_up|follow|白鞋沾泥先怎么处理？~等泥干后刷掉浮土。~刷完还有印子呢？|剩下的印子用温和清洁液局部轻擦，先在不显眼处试一下，别整双浸泡。
ref_02|follow_up|follow|我想种一盆薄荷。~先找排水好的小盆。~需要晒多久？|薄荷喜欢明亮光线，但刚栽好别立刻暴晒；先给柔和日照，再看叶片状态调整。
ref_03|follow_up|follow|坐长途车容易晕。~上车前别吃太撑，尽量看远处。~坐哪里会好一点？|通常靠前、朝前且能看到远处的位置更稳些，也尽量避开闷热和浓气味。
ref_04|follow_up|follow|书太多，我先按会不会再读分两堆。~这样分很清楚。~想留下的那堆呢？|留下的再按常用程度分层：常看的放顺手处，偶尔看的集中到高处或箱里。
ref_05|follow_up|follow|充电线用完总散在各处。~先在书桌边固定一个收线盒。~离开书桌时还是忘了放回去呢？|把拔线和收线连成一个动作，也可在插座旁贴个小标记，先连续做几天形成习惯。
ref_06|follow_up|follow|燕麦可以隔夜泡。~密封冷藏就行。~早上太稠怎么办？|先少量加牛奶或水搅开，别一次倒太多；稠度合适后再加水果或坚果。
ref_07|follow_up|follow|窗台灰很多。~先用吸尘器低档吸浮灰。~缝里吸不到呢？|用软毛小刷把缝里的灰带出来，再拿微湿布收尾，避免直接往缝里灌水。
ref_08|follow_up|follow|我想晚上走半小时。~选熟悉、光线好的路。~下雨的话呢？|下雨就改成室内来回走或做一段轻松拉伸，保留半小时活动，不必硬淋雨。
ref_09|follow_up|follow|毛巾有点硬。~洗时别放太多清洁剂。~已经硬了怎么处理？|用清水充分漂洗后自然晾干，干时轻轻抖松；先别继续叠加柔顺剂掩盖残留。
ref_10|follow_up|follow|我把桌面垃圾清掉了。~很好，下一步收常用物。~收完之后呢？|最后只擦一遍空出来的表面，再给零碎物留一个固定小盒，今天就可以停。
ref_11|follow_up|follow|鸡胸肉容易煎柴。~厚薄尽量均匀，别一直大火。~怎么判断可以停火？|最稳妥是看中心是否完全熟透；没有温度计就切最厚处确认，再及时离火静置。
ref_12|follow_up|follow|我要写一封请假邮件。~先说明日期和交接。~结尾怎么写？|结尾简单说“给你添麻烦了，我会提前完成交接”，然后署名即可，不必反复道歉。
ref_13|follow_up|follow|下午想喝点不含咖啡的。~可以泡花草茶或温柠檬水。~想喝凉的呢？|可以用冷泡无咖啡茶或气泡水加水果片，少放糖，先确认配料里没有茶咖啡因。
ref_14|follow_up|follow|我准备按房间装搬家箱。~先从不常用的房间开始。~箱子怎么标？|每箱写房间、内容和优先级，至少两面都标；到新家堆放时就不用反复翻面找。
ref_15|follow_up|follow|衬衫皱了但没熨斗。~挂进浴室借一点蒸汽。~还是有折痕呢？|用微湿毛巾隔着轻压，再挂平晾干；先确认面料耐热，别直接用高温吹近处。
ref_16|follow_up|follow|我想把手机照片按月份分。~先做粗分会比较快。~重复照片怎么办？|每个月只留清楚且有意义的一两张相似照，其余放进待删相册，过几天再统一确认。
ref_17|follow_up|follow|绿豆汤想少放糖。~可以煮好后分碗再调甜度。~不放糖会不会没味道？|不放糖也可以，加一点陈皮或让豆香更浓；先尝原味，再决定是否补少量甜味。
ref_18|follow_up|follow|我想早点睡。~先把上床时间提前半小时。~手机怎么办？|睡前二十分钟把手机放到够不到的地方，闹钟先设好，别让“再看一下”一直续时间。
ref_19|follow_up|follow|布鞋淋湿了。~先吸掉表面水再阴干。~里面一直潮呢？|塞入干纸吸湿并定时更换，鞋口撑开通风；不要贴着暖气烤，以免胶和鞋面变形。
ref_20|referent_order|referent|早餐有粥、饭团和吐司。~三个选择记下了。~第二个适合带走吗？|饭团更方便带走，外面包好并尽快吃；如果有易坏馅料，就别在常温放太久。
ref_21|referent_order|referent|要办的地方依次是药房、面包店和洗衣店。~三个地方记下了。~第二处通常会很早关门吗？|第二处是面包店；营业时间要看具体店铺，下午去之前最好先查当天公告或打电话确认。
ref_22|referent_order|referent|围巾有米色、深绿和灰蓝三条。~三条围巾。~末尾那条容易搭深色外套吗？|末尾是灰蓝色围巾，通常能和深色外套搭配；还要看外套冷暖色调与围巾材质。
ref_23|referent_order|referent|先给植物浇水，再回邮件，最后整理背包。~顺序记下了。~中间那件能留到晚些时候吗？|中间是回邮件；若没有今天的截止时间，可以稍后处理，但别因此耽误最后的背包整理。
ref_24|referent_order|referent|渡轮有早上八点二十和下午四点四十两班。~两个班次。~后面那班回来会不会天黑？|后面是下午四点四十的班次；返程是否天黑取决于航程与季节，需要再查当天日落和回程时刻。
ref_25|referent_order|referent|收纳盒有陶瓷、搪瓷和竹制三种。~记住了。~中间那种磕掉漆还能装食物吗？|中间是搪瓷盒；若内层掉漆或露出金属，就别继续装食物，完好的轻微外观划痕另当别论。
ref_26|referent_order|referent|方案一更安静，方案二离车站更近。~两个方案。~第二种有什么明显代价？|第二种离车站近，但可能人流和噪声更多，价格也未必低；不能只用通勤距离判断。
ref_27|referent_order|referent|我打算先去图书馆，再去修鞋店。~顺序清楚。~前一个工作日几点关门？|前一个是图书馆；具体闭馆时间取决于分馆和日期，出门前要查它的官方当日安排。
ref_28|referent_order|referent|两门课，一门练习多，一门提供回放。~好。~后者适合刚入门的人吗？|后者是提供回放的课程，复习方便，但是否适合入门还要看讲解起点、作业难度和答疑方式。
ref_29|referent_order|referent|加餐可以选坚果、酸奶或烤燕麦。~三个选项。~第三样单吃会不会太干？|第三样是烤燕麦，单吃可能偏干，可以配水、牛奶或酸奶；份量也别一次倒得太多。
ref_30|referent_attribute|referent|桌上有裂口碗和新碗。~两个碗。~有裂口的还能用吗？|有裂口的碗可能继续开裂或藏污，尤其装热食时不稳妥，最好停用。
ref_31|referent_attribute|referent|两个取件点，一个有工作人员，一个是自助柜。~明白。~有人的那处几点停止服务？|你问的是有工作人员的取件点，但现在没有营业时间；需要具体门店和日期才能确认。
ref_32|referent_attribute|referent|我带了轻便折伞和一把遮阳伞。~两把伞。~遮阳那把遇到小雨能用吗？|你指遮阳伞。短时挡小雨或许可以，但它未必防水抗风，是否使用还要看伞面说明和雨势。
ref_33|referent_attribute|referent|冷藏层有开封的鹰嘴豆泥和今天煮的玉米。~两样食物。~开过封的那个还能吃吗？|你指鹰嘴豆泥。要看开封日期、冷藏温度和气味；存放时间不清或出现异常就别吃。
ref_34|referent_attribute|referent|阳台上有一盆迷迭香和一盆多肉。~记住了。~香草那盆是不是要天天浇？|香草那盆是迷迭香，不必固定每天浇；先摸土壤，表层干后再浇透，避免盆底长期积水。
ref_35|referent_attribute|referent|两个空房间，一个朝内院，一个挨着水管井。~好。~挨水管的夜里会有声音吗？|挨水管井的房间可能听到水流或设备声，但强弱取决于隔音和楼内使用情况，最好实地听一晚。
ref_36|referent_attribute|referent|候选风扇一台更安静，一台耗电更低。~明白。~安静的适合整晚开吗？|安静那台在声音上更适合夜间，但能否整晚开还要看稳定性、定时功能和厂家使用说明。
ref_37|referent_attribute|referent|我有带软垫的托特包和能封口的斜挎袋。~两个包。~有软垫的能直接放电脑吗？|你指带软垫的托特包。软垫能减轻轻微碰撞，但还要确认尺寸、底部支撑和防水，不能只看一层垫料。
ref_38|referent_attribute|referent|两家店，一家近，一家很晚关门。~知道了。~晚关门的周末也开吗？|你问营业到很晚的店；周末是否开门不能从这条信息推出，最好查它的周末时间。
ref_39|referent_attribute|referent|桌上有黑麦面包和一盒苏打饼干。~好。~颜色深的那个能配浓汤吗？|颜色深的是黑麦面包，通常可以配浓汤；味道是否协调还要看面包酸度和汤的咸淡。
"""

CORRECTION = r"""
cor_00|time_correction|correction|周五要清洗鱼缸过滤棉。~记在周五。~看错日历了，应该是周日。|清洗时间改为周日，周五的旧安排取消；当天先准备一盆原缸水，别用自来水直接冲滤材。
cor_01|time_correction|correction|钢琴课约在上午十点一刻。~十点一刻上课。~老师改成十一点四十。|课程时间更新为上午十一点四十，十点一刻不再有效；出发时间也按新安排后移。
cor_02|time_correction|correction|我打算今晚给阳台换盆。~今晚换盆。~还是改到后天早上。|换盆改到后天早上，今晚只需把土和花盆备好，不再按今晚完成来安排。
cor_03|time_correction|correction|展览预约在本周三傍晚。~周三傍晚去。~邮件确认的是下周一中午。|参观时间以邮件为准，改为下周一中午；本周三的记录应标成已作废。
cor_04|time_correction|correction|我准备六点十分去晨跑。~六点十分出发。~天气热，提前到五点五十。|晨跑出发改为五点五十，比旧计划早二十分钟，起床和喝水时间也相应提前。
cor_05|time_correction|correction|烤面包准备下午两点开始。~两点开始。~烤箱要让给别人，改到四点二十。|开始时间更新为下午四点二十，两点的旧安排取消；发酵节奏也要按新时间调整。
cor_06|time_correction|correction|维修师傅原定八月十二日上门。~八月十二日。~新短信改成八月十五日。|上门日期以新短信的八月十五日为准，八月十二日不再作为有效预约。
cor_07|time_correction|correction|我们准备午饭后取照片。~午饭后去取。~店家说只能傍晚六点后。|取照片改到傍晚六点后，午饭后的安排取消；出门前再确认店铺是否已通知完成。
cor_08|time_correction|correction|露营装备原本打算月初整理。~月初整理。~同行的人说二十六号前就要打包好。|完成时间改为二十六号之前，检查和补购物品都要前移，不能再按月初慢慢整理。
cor_09|time_correction|correction|机场巴士原说七点五十到。~七点五十。~通知显示会延到八点十五。|最新到达时间是八点十五，接人的出发时间按它重算；七点五十只保留为旧信息。
cor_10|time_correction|correction|快递说周五送。~周五。~客服改成周六上午。|配送时间更新为周六上午，周五无需继续等待；留意周六的电话即可。
cor_11|time_correction|correction|课程七点开始。~七点上课。~老师说改到六点四十五。|课程按六点四十五开始，至少再提前一点到场，七点不再是有效开课时间。
cor_12|time_correction|correction|我周一去剪头发。~周一。~约到的是周三。|剪发安排改到周三，周一可以释放出来；后续提醒只保留周三这一条。
cor_13|time_correction|correction|浇花定在晚上。~晚上浇。~最近太冷，改成中午。|浇花改到中午，晚上不再执行；先看盆土是否干，不必因为改时段就额外多浇。
cor_14|object_correction|correction|说说新鲜迷迭香怎么存放。~先讲迷迭香。~我拿错了，其实是百里香。|对象改成百里香：保持干爽，用微湿纸包后冷藏；迷迭香不再是当前要处理的香草。
cor_15|object_correction|correction|储物间那张折叠桌要搬出去。~搬折叠桌。~说反了，要搬的是矮书架。|要搬的是矮书架，不是折叠桌；先清空书架再移动，避免带着物品搬错对象。
cor_16|object_correction|correction|我在替邻居家的小孩挑绘本。~给孩子挑绘本。~其实礼物是送给刚退休的老师。|收礼对象更新为刚退休的老师，后续应按他的兴趣选择，不再沿用儿童绘本的方向。
cor_17|object_correction|correction|午餐准备做芦笋炒蛋。~做芦笋炒蛋。~冰箱里的是秋葵，不是芦笋。|食材改成秋葵，可以做秋葵炒蛋；芦笋的处理方法先放下，别把两种蔬菜混用。
cor_18|object_correction|correction|出门要带条纹资料袋。~带条纹袋。~我需要的是有圆点的那只。|要带的是圆点资料袋，条纹那只留在原处；装文件前按图案和标签再核对。
cor_19|object_correction|correction|把咖啡豆收到密封罐里。~收咖啡豆。~不是咖啡豆，是散装红茶。|需要密封保存的是红茶，咖啡豆不是当前对象；罐子保持干燥，避免串味。
cor_20|object_correction|correction|我一直在找公交月票。~找月票。~刚想起丢的是储物柜卡。|现在要找的是储物柜卡；优先检查换衣和放包的位置，不再围着公交月票找。
cor_21|object_correction|correction|给书房选一块小地毯。~书房地毯。~房间说错了，是玄关。|地毯是放玄关的，应优先看耐脏、防滑和易清理，不再按书房的柔软需求选择。
cor_22|object_correction|correction|这张邀请函先发给摄影师。~发给摄影师。~等等，收件人应是场地方。|收件人改为场地方，发送前移除摄影师地址，并核对称呼与场地相关内容。
cor_23|object_correction|correction|我想修那台银色台扇。~修银色台扇。~看错了，是白色加湿器漏水。|需要检查的是白色加湿器，不是台扇；先断电倒空水箱，再查密封圈和裂纹。
cor_24|object_correction|correction|给阳台那盆薄荷施肥。~薄荷施肥。~我指的是窗边的绿萝。|对象改成窗边绿萝，先看生长状态再决定是否施肥，别把薄荷的安排直接照搬。
cor_25|object_correction|correction|我要退那件衬衫。~退衬衫。~不是衬衫，是裤子尺码不对。|要退的是尺码不对的裤子；把裤子的订单和包装找齐，衬衫不用进入退货流程。
cor_26|object_correction|correction|把厨房灯关掉。~关厨房灯。~说错了，是走廊灯。|现在要关的是走廊灯，厨房灯保持原状；执行前按位置确认一次就行。
cor_27|quantity_correction|correction|野餐先装两壶茶。~两壶。~人数增加了，改装三壶半。|茶的数量更新为三壶半，准备清单只保留新数目；两壶已经不足。
cor_28|quantity_correction|correction|这锅酱先加六十毫升醋。~六十毫升。~配方看反了，只要二十五毫升。|醋改为二十五毫升，应先量好再加入；不要继续按六十毫升执行。
cor_29|quantity_correction|correction|皮划艇体验先报五个人。~五个人。~两位临时有事，改成三人。|报名人数改为三人，付款前按三位参与者核对信息，另外两份名额取消。
cor_30|quantity_correction|correction|活动手册准备十八本。~十八本。~确认到场只有十一位。|手册数量更新为十一份，可另留一份备用；不必继续印十八本。
cor_31|quantity_correction|correction|从住处骑车到码头估计十二分钟。~十二分钟。~路线封闭，绕行要二十八分钟。|骑行时间应按二十八分钟估算，出发时间需要提前；十二分钟的旧估计不再可靠。
cor_32|quantity_correction|correction|给桌灯留六百元预算。~六百元。~现在上限降到四百二十。|预算上限改为四百二十元，候选范围要据此收紧，不能再默认六百元可用。
cor_33|quantity_correction|correction|干豆先浸泡三个小时。~三个小时。~包装写的是七小时。|浸泡时间改为七小时，后续烹煮要顺延；三个小时只当作已纠正的旧值。
cor_34|quantity_correction|correction|每个花盆先放四块陶粒。~每盆四块。~陶粒不够，改成每盆三块。|分配改为每盆三块，先按花盆数量数好；不要继续按四块拿取。
cor_35|quantity_correction|correction|读书分享原计划四十五分钟。~四十五分钟。~场地只剩十八分钟。|分享上限改为十八分钟，只保留一本书和一个讨论问题，原议程需要压缩。
cor_36|quantity_correction|correction|我准备折十六只纸鹤。~十六只。~展示架更大，改成二十四只。|目标数量更新为二十四只，纸张也按新数量补足；十六只无法铺满展示架。
cor_37|quantity_correction|correction|架子要放四层。~四层。~量完高度只能放三层。|层数改为三层，间距按三层重新分配，别再照四层的位置打孔。
cor_38|quantity_correction|correction|带两条毛巾就够。~两条。~孩子也来，要带四条。|毛巾数量改为四条，装包时按四条核对，两条的旧判断已经不适用。
cor_39|quantity_correction|correction|浇一杯水。~一杯。~盆很小，半杯就行。|水量更新为半杯，先慢慢浇并观察是否流出，别继续倒满一杯。
"""

CONSTRAINTS = r"""
con_00|one_constraint|constraint|给我一个不辣的晚饭主意。|可以做番茄鸡蛋面，完全不放辣椒，味道靠番茄和一点葱提起来。
con_01|one_constraint|constraint|安排一个半小时内结束的散步。|选一条熟悉的短环线，走二十分钟后折返，给回程和休息留出余量。
con_02|one_constraint|constraint|推荐一份不用烤箱的甜点。|做酸奶水果杯就行，水果切小块后分层装入，不需要烤箱也不用久等。
con_03|one_constraint|constraint|想个一百元以内的小礼物。|可以选一本小册子配一张手写卡，价格容易控制，也比随便凑件摆设更具体。
con_04|one_constraint|constraint|给我一条适合雨天的通勤建议。|优先走有遮挡、路面平整的路线，鞋子选防滑的，并给换乘多留几分钟。
con_05|one_constraint|constraint|做一杯不含咖啡的下午饮料。|可以泡一杯温柠檬蜂蜜水，甜度自己控制，也不会带来咖啡因。
con_06|one_constraint|constraint|写一句语气温和的拒绝。|“谢谢你想到我，不过这次我没办法参加，希望下次有机会。”
con_07|one_constraint|constraint|安排一个不用出门的周末活动。|挑一部一直没看的电影，再做顿简单饭，中间留一段什么都不安排的时间。
con_08|one_constraint|constraint|推荐一道可以冷吃的午餐。|做鸡蛋土豆沙拉比较合适，提前冷藏分装，吃前确认保存时间和温度。
con_09|one_constraint|constraint|给三岁孩子想个收纳办法。|用低矮、无尖角的开放盒，图案标出玩具类别，让孩子能自己拿放。
con_10|two_constraints|constraint|晚饭要清淡，而且二十分钟内做好。|煮青菜鸡蛋汤面最省事，少油少盐，水开后十几分钟就能端上桌。
con_11|two_constraints|constraint|找个安静、离车站近的碰面地点。|先看车站旁侧街的咖啡店或公共休息区，避开进站口正对的人流位置。
con_12|two_constraints|constraint|礼物要实用，预算不超过两百。|可以选质量稳妥的保温杯或桌面灯，先把价格卡在两百内，再看对方是否真会用。
con_13|two_constraints|constraint|写一句简短但不冷淡的回复。|“收到，谢谢你说明情况，我按这个时间准备。”
con_14|two_constraints|constraint|安排室内活动，而且要能带狗。|找允许宠物进入的室内市集或宽敞咖啡店，出发前先确认店规和时段。
con_15|two_constraints|constraint|早餐不要甜，也不要用奶。|可以吃咸燕麦粥配鸡蛋，用水或清汤煮，既不甜也不需要奶。
con_16|two_constraints|constraint|路线要少走楼梯，并且避开大路。|优先选有电梯的社区内路线，沿支路走，出发前检查施工和无障碍入口。
con_17|two_constraints|constraint|选一件耐洗、颜色低调的衣服。|深灰或藏蓝的棉质基础款更合适，先看洗标，避开只能特殊护理的面料。
con_18|two_constraints|constraint|计划要在九点前结束，花费也低。|七点左右开始散步，再回家看一集短片，九点前收尾，基本不用额外花钱。
con_19|two_constraints|constraint|摘要要保留数字，并控制在两句。|“会议改到周四三点，地点仍是二楼。请在周三前交齐六份材料。”
con_20|late_constraint|constraint|帮我排一个周日早晨的家务顺序。~可以先列要做的事。~补充一下，吸尘器八点后才能开。|先做擦桌和整理衣物，八点后再吸地，最后倒垃圾；这样噪声限制不会被前面的安排挤掉。
con_21|late_constraint|constraint|想一条从码头走到旧书店的路线。~可以。~同行的人不能走陡坡。|路线要选坡度缓、有人行道的一侧，避开长台阶；出发前再用地图确认沿途坡度。
con_22|late_constraint|constraint|给参加陶艺课的人挑个小物件。~说说偏好。~它还必须能装进上衣口袋。|可以选一把小号修坯刀或薄木刮片，体积轻巧；下单前仍要核对刀具是否允许随身携带。
con_23|late_constraint|constraint|写一句推迟交照片的话。~好。~别承诺具体哪天完成。|“照片还需要一点整理时间，我完成后会第一时间发给你，抱歉让你久等。”
con_24|late_constraint|constraint|想一个十分钟能做好的下午加餐。~可以。~刚发现没有可用的炉子。|可以把酸奶、燕麦和切好的梨拌在一起，不用加热，十分钟内就能完成。
con_25|late_constraint|constraint|把九十分钟的整理任务分两段。~好。~两段之间必须离开房间十五分钟。|先整理四十分钟，离开房间休息十五分钟，再用三十五分钟收尾；休息时间单独保留。
con_26|late_constraint|constraint|帮我选一双室内训练鞋。~可以。~地板很滑，防滑要放第一。|优先看鞋底抓地纹路和横向稳定，再确认尺码合脚；轻便不能排在防滑之前。
con_27|late_constraint|constraint|想个午后能和长辈一起做的活动。~可以。~对方看小字很费力。|可以听一段广播剧或整理旧照片，避免依赖小字说明，并把光线调到舒服范围。
con_28|late_constraint|constraint|帮我把一段说明改得更友好。~把原文发来。~结尾不能用提问句。|可以，改写时会保留重点，用陈述句自然收尾，不在最后向读者追问。
con_29|late_constraint|constraint|列一个阳台种植的采购单。~好。~所有东西要能塞进一个手提篮。|清单可放两个小盆、一袋轻质土、种子和小铲，先量篮子尺寸，不买大袋基质。
con_30|removed_constraint|constraint|点心原先要求无麸质并且不含坚果。~两个条件。~无麸质不用了，只避开坚果。|现在只保留不含坚果，可以考虑普通燕麦饼；仍要检查包装上的过敏原和生产线提示。
con_31|removed_constraint|constraint|散步路线原本要沿海而且避开台阶。~明白。~沿海不重要了，还是不能有台阶。|现在只要避开台阶，可以选择附近平缓街区，不必为了海景绕远。
con_32|removed_constraint|constraint|收纳箱要透明并且高度低于二十厘米。~好。~透明随意，高度限制保留。|透明限制已经取消，只需保证高度低于二十厘米，可以按结实和易清洁扩大选择。
con_33|removed_constraint|constraint|留言原本要押韵而且只有一行。~知道了。~不用押韵，但仍保持一行。|“东西我已经放在门边，回来时记得拿。”保留一行，不再为了押韵改变意思。
con_34|removed_constraint|constraint|休息活动原先要坐着并且不能看屏幕。~两个限制。~可以站起来，还是别看屏幕。|坐着的限制已移除，可以去阳台走几步或拉伸，仍然不使用屏幕。
con_35|removed_constraint|constraint|饮品原先不能冰也不能加蜂蜜。~都不加。~温度随意，蜂蜜仍然不要。|现在只需不加蜂蜜，可以喝冷泡水果水；是否冰镇由你当时的感觉决定。
con_36|removed_constraint|constraint|住处原本要有厨房并且允许晚退房。~明白。~厨房不需要了，晚退房要保留。|只保留允许晚退房这一项，筛选时可忽略厨房，把退房政策和附加费用放在前面。
con_37|removed_constraint|constraint|备忘录原本要分三段且不超过八十字。~好。~不用分段，字数上限不变。|分段限制取消，直接写八十字内的连续正文即可，仍要保留时间和待办事项。
con_38|removed_constraint|constraint|碰面原先定周一并且四点前结束。~记下了。~星期可以调整，结束时间不变。|星期限制已经放开，可以另选大家方便的一天，但仍必须在下午四点前结束。
con_39|removed_constraint|constraint|背包原先要绿色并且重量低于八百克。~好。~颜色不限，重量别超。|颜色不再限制，只保留八百克以内，可以优先比较背负舒适度和隔层。
"""

REWRITE_SUMMARY = r"""
rew_00|rewrite|rewrite|改短：因为今天下雨，所以原定的户外活动需要改期。|今天下雨，户外活动改期。
rew_01|rewrite|rewrite|说得柔和一点：你交的材料缺了两页。|你交的材料好像少了两页，方便再补一下吗？
rew_02|rewrite|rewrite|改自然：本人现已抵达指定地点并等待您的到来。|我已经到了，在这里等你。
rew_03|rewrite|rewrite|改得不那么生硬：我不能参加，请另找人。|这次我参加不了，你再看看有没有合适的人吧。
rew_04|rewrite|rewrite|改成日常口吻：烦请于方便时给予回复。|你方便的时候回我一下就好。
rew_05|rewrite|rewrite|压成一句：我试了两次都没成功，但打算明天再试。|今天试了两次没成，我明天再来。
rew_06|rewrite|rewrite|去掉客服腔：感谢您的耐心等待，我们将持续跟进。|让你久等了，有进展我就告诉你。
rew_07|rewrite|rewrite|改清楚：那个放在那边的东西需要挪到这边。|请把窗边的纸箱移到门旁。
rew_08|rewrite|rewrite|保留歉意但简短：对不起，我把新版清单发晚了，耽误了你核对。|抱歉，新版清单发晚了，耽误你核对了。
rew_09|rewrite|rewrite|改成不夸张：这顿饭好吃到让我彻底改变人生。|这顿饭很好吃，我会想再来。
rew_10|rewrite|rewrite|把这句改得坚定但不凶：我真的不想再讨论这件事。|这件事我不想再谈了，到这里吧。
rew_11|rewrite|rewrite|改得像朋友说话：请注意携带雨具以防降雨。|可能会下雨，记得带伞。
rew_12|rewrite|rewrite|缩短：考虑到交通可能拥堵，我建议我们提前二十分钟出发。|怕堵车，我们提前二十分钟走。
rew_13|rewrite|rewrite|改礼貌：你发错文件了，重新发。|你刚才发的文件可能不对，麻烦再确认后发一次。
rew_14|rewrite|rewrite|去掉官话：我们将对相关问题进行进一步研究。|这个问题还要再查一下。
rew_15|rewrite|rewrite|改得不冷淡：知道了。|知道了，谢谢你告诉我。
rew_16|rewrite|rewrite|把否定说轻一点：这个方案完全不可行。|这个方案现在有几个关键条件还不满足。
rew_17|rewrite|rewrite|压缩：如果你今天没有时间，我们也可以把见面安排到明天下午。|今天没空的话，明天下午见也行。
rew_18|rewrite|rewrite|改自然：鉴于本人身体略感疲惫，今日将提前休息。|我今天有点累，准备早点睡。
rew_19|rewrite|rewrite|改成一句便签：出门之前务必检查窗户是否已经关闭。|出门前记得关窗。
rew_20|short_summary|summary|总结：先关窗，再收衣服，最后把阳台擦干。|顺序是关窗、收衣服，再擦干阳台。
rew_21|short_summary|summary|概括：会议提前半小时，地点不变，需要带打印件。|会议提前半小时，地点不变，记得带打印件。
rew_22|short_summary|summary|短总结：小店周一休息，工作日九点开，周末十点开。|小店周一休息；平日九点、周末十点开门。
rew_23|short_summary|summary|概括：我不是不想去，只是晚上已有安排，周日下午可以。|今晚有安排去不了，但周日下午可以。
rew_24|short_summary|summary|一句话总结：雨太大，公交停运，所以我们改成线上见。|因大雨和公交停运，见面改为线上。
rew_25|short_summary|summary|归纳：红盒装工具，蓝盒装线材，透明盒放零件。|红盒放工具，蓝盒放线材，透明盒放零件。
rew_26|short_summary|summary|总结重点：预算三百，优先耐用，颜色不重要。|预算三百元以内，耐用优先，颜色不限。
rew_27|short_summary|summary|压缩：菜已经买了，米还没煮，客人七点到。|菜已买，米待煮，客人七点到。
rew_28|short_summary|summary|概括：第一条路近但吵，第二条远一点却更安全。|路线一近但吵，路线二稍远却更安全。
rew_29|short_summary|summary|总结顺序：确认人数、订桌、再通知大家具体地址。|先确认人数，再订桌，最后发地址。
rew_30|short_summary|summary|概括：上午修电脑，下午取眼镜，晚上不用出门。|上午修电脑，下午取眼镜，晚上留在家。
rew_31|short_summary|summary|总结：杯子不漏水，但杯盖太紧，清洗也不方便。|杯子密封好，但杯盖难开且不易清洗。
rew_32|short_summary|summary|概括：周五交初稿，周一反馈，周三完成修改。|周五交初稿，周一收反馈，周三改完。
rew_33|short_summary|summary|总结：猫早上吃药，晚上复查，期间观察喝水。|早上喂药，留意饮水，晚上复查。
rew_34|short_summary|summary|短总结：箱子太重，电梯停运，只能分两次搬。|因箱重且电梯停运，需要分两次搬。
rew_35|short_summary|summary|归纳：衬衫合身但颜色太亮，裤子颜色合适却偏长。|衬衫合身但太亮；裤子颜色合适但偏长。
rew_36|short_summary|summary|总结：先备份照片，再清空旧手机，最后交给家人。|先备份，再清空旧手机，之后交给家人。
rew_37|short_summary|summary|概括：汤味道够了，不要再放盐，出锅前加葱。|汤不用加盐，出锅前放葱即可。
rew_38|short_summary|summary|总结：门票已买，住宿未定，周日返程。|门票已买，住宿待定，周日回来。
rew_39|short_summary|summary|归纳：先试小号，不合适再换中号，吊牌别剪。|先试小号，不合适换中号，暂时保留吊牌。
"""

PLAN_COMPARE = r"""
pln_00|simple_planning|plan|我有四十分钟，安排洗澡和简单吃饭。|先用十五分钟洗澡，再用二十分钟热饭或煮面，最后五分钟收拾并准备出门。
pln_01|simple_planning|plan|明早出门前要浇花、装水、拿快递，排一下。|先装水和整理随身物，再浇花，最后出门时顺路拿快递，避免拿着包来回走。
pln_02|simple_planning|plan|两小时内收拾卧室，给三个步骤。|先清垃圾和脏衣物，再把常用品归位，最后擦桌扫地；每步控制在四十分钟内。
pln_03|simple_planning|plan|下班后想买菜再做面，怎么排省事？|下班前列好清单，回程顺路买菜，到家先烧水再洗菜，面煮好后一起收尾。
pln_04|simple_planning|plan|周日半天要洗衣、读书、午睡，简单安排。|先开洗衣机，再读一小时；晾好衣服后午睡，醒来留一点缓冲，不要把半天排满。
pln_05|simple_planning|plan|客人一小时后到，先扫地还是先备茶？|先烧水并把茶具放好，再快速扫主要区域，最后十分钟通风和收零碎物。
pln_06|simple_planning|plan|九点前要完成散步和回邮件，怎么安排？|先用二十分钟回必须的邮件，再散步半小时，八点四十左右回家，留出收尾时间。
pln_07|simple_planning|plan|只有二十分钟做早餐并装午餐。|先把午餐装盒，同时烧水；早餐选吐司或燕麦，最后检查餐具，别临时做复杂菜。
pln_08|simple_planning|plan|明天搬三箱书，先做什么后做什么？|今晚按重量分箱并封好，明天先搬最重的一箱，确认路线后再搬剩下两箱。
pln_09|simple_planning|plan|今晚想练琴、洗碗、早点睡，给个短计划。|先洗碗清掉挂念，再练琴三十分钟，随后收琴洗漱，把上床时间守住。
pln_10|simple_planning|plan|上午要去银行和邮局，怎么少绕路？|先查两处营业时间，再按离家和关门先后排序，尽量把较早关门的放在前面。
pln_11|simple_planning|plan|一小时准备明天的衣服和早餐。|前十五分钟选衣服并装包，接着准备可冷藏的早餐，最后检查天气和钥匙。
pln_12|simple_planning|plan|房间乱，但我只想收拾三十分钟。|先定一个区域，十分钟扔垃圾、十分钟归位、十分钟擦表面，时间到就停。
pln_13|simple_planning|plan|午休要吃饭、取件、走一会儿。|先取件避免临近结束排队，再吃饭，最后用剩余十分钟慢走回去。
pln_14|simple_planning|plan|晚上七点来客人，我要做汤和凉菜。|先把凉菜食材洗切冷藏，再提前炖汤，客人到前调凉菜并最后尝汤味。
pln_15|simple_planning|plan|周末想去市场再看展，如何安排？|早上先去市场避开拥挤，中午休息并放好东西，下午再去看展，别一直提着采购物。
pln_16|simple_planning|plan|我要在下雨前收阳台和遛狗。|先看雨势，如果还有空档就短程遛狗，回来立刻收阳台；时间太紧则先保证安全。
pln_17|simple_planning|plan|今晚读书四十页，还要早点休息。|把四十页分成两段，中间休息五分钟，设定结束时间，到点不再往后加页数。
pln_18|simple_planning|plan|我有三样快递要退，怎么处理快？|先核对订单和退货期限，再分别装好贴标签，最后一次性去同一寄件点办理。
pln_19|simple_planning|plan|明早六点出发，今晚需要准备什么？|先确认路线和证件，再装水、充电和衣物，最后设两个闹钟并尽早停止临时加东西。
pln_20|simple_comparison|compare|保温杯选不锈钢还是玻璃内胆？|不锈钢更耐摔、通常更轻；玻璃内胆气味残留少但怕碰。按携带频率和清洗习惯选。
pln_21|simple_comparison|compare|短途通勤，走路和骑车怎么选？|走路准备少但更费时间；骑车快一些，却要考虑停车、路况和雨天安全。
pln_22|simple_comparison|compare|小房间用落地灯还是台灯？|台灯占地少、照桌面直接；落地灯光线范围大但占空间。主要阅读就先看台灯。
pln_23|simple_comparison|compare|早餐吃粥和吃吐司各有什么方便之处？|粥温热、可提前煮，但携带不便；吐司拿取快、好带走，却需要搭配别的食物更顶饿。
pln_24|simple_comparison|compare|纸袋和布袋装书，哪个更合适？|少量短途用纸袋就够，但怕雨和撕裂；布袋更耐用，装重书时也要看提带是否结实。
pln_25|simple_comparison|compare|雨天穿皮鞋还是运动鞋更省心？|普通皮鞋怕水渍，运动鞋更好走但也未必防水；优先选防滑、易干的那双。
pln_26|simple_comparison|compare|两小时空闲，看电影还是去散步？|电影适合想安静坐着，散步更能换环境。看你现在缺休息还是缺活动，不必都塞进去。
pln_27|simple_comparison|compare|冷藏盒选圆的还是方的？|方盒更省冰箱空间、好堆叠；圆盒拌食物方便、边角少。按收纳空间和用途选。
pln_28|simple_comparison|compare|提醒事项写纸上还是放手机里？|纸条醒目但不随身，手机能定时却容易被通知淹没；重要事项可手机提醒配固定纸条。
pln_29|simple_comparison|compare|见面地点选商场还是公园？|商场不怕天气、设施多，但可能吵；公园放松、空间大，却受天气和天黑影响。
pln_30|simple_comparison|compare|雨伞选长柄还是折叠的？|长柄伞通常更稳、更好撑，折叠伞便于携带。常走路看稳固，通勤装包看体积。
pln_31|simple_comparison|compare|晾衣架木的和塑料的怎么选？|木衣架支撑好但较重、怕潮；塑料轻且便宜，承重和耐久差异更大。
pln_32|simple_comparison|compare|午餐带饭还是在外面买？|带饭更可控也省钱，但要提前准备和冷藏；外买省时间，选择与花费不稳定。
pln_33|simple_comparison|compare|收纳用抽屉盒还是开放篮？|抽屉盒防尘、堆叠整齐；开放篮一眼可见、拿取快。常用物更适合开放篮。
pln_34|simple_comparison|compare|旅行带纸书还是电子书？|纸书不需充电但占重量；电子书能带很多本，却依赖设备和电量。
pln_35|simple_comparison|compare|拖地用冷水还是温水？|温水更容易带走部分油污，冷水对多数日常灰尘已够；还要先看地板材质和清洁剂说明。
pln_36|simple_comparison|compare|小礼物选植物还是零食？|植物能留久但需要照顾，零食负担小却要留意口味和禁忌；按对方习惯选。
pln_37|simple_comparison|compare|早上洗头和晚上洗头哪个方便？|早洗清爽但占出门时间，晚洗从容却必须完全吹干；看你的作息和头发干燥速度。
pln_38|simple_comparison|compare|通风用开一扇窗还是两边对开？|两边对开换气更快，但风也更大；只开一扇更温和。天气和室内物品要一起考虑。
pln_39|simple_comparison|compare|厨房用布帘还是百叶帘？|布帘柔和但容易沾油，百叶好调光却要逐片清洁；离灶台近更要看易清洗和安全。
"""

UNCERTAINTY = r"""
unc_00|uncertainty|uncertain|我没看包装，这盒牛奶是不是坏了？|现在不能确定。先看保存温度、日期、包装是否鼓起和气味；有异常就别尝。
unc_01|uncertainty|uncertain|不知道他有没有出门，你觉得他已经到了吗？|没有行程或消息就不能判断他到了；直接问一句，别把猜测当成事实。
unc_02|uncertainty|uncertain|我没说城市，明天会下雨吗？|缺少地点，没法判断明天的天气。告诉我城市，或直接看当地最新预报。
unc_03|uncertainty|uncertain|没看到实物，这件衣服一定是真丝吗？|只凭描述不能确认材质。看洗标、纤维成分和购买凭证，比凭手感猜更可靠。
unc_04|uncertainty|uncertain|只听到一声响，能判断是什么掉了吗？|一声响不足以确定物品。先安全检查声音方向和周围，再看有没有破损或移位。
unc_05|uncertainty|uncertain|我忘了浇水日期，这盆花现在缺水吗？|不能只靠日期判断。摸一下表土和盆的重量，再看叶片状态，干了再浇。
unc_06|uncertainty|uncertain|没有订单号，你能知道快递几点到吗？|没有订单和物流信息就不知道具体时间。先找到承运方消息或联系寄件人。
unc_07|uncertainty|uncertain|我只说电脑很慢，能确定是硬盘坏了吗？|不能确定。变慢可能来自存储、内存或后台任务，先看剩余空间和活动情况。
unc_08|uncertainty|uncertain|没量尺寸，这个盒子肯定放得下吗？|不能保证。先量物品和盒子的内径，长宽高都留一点余量再判断。
unc_09|uncertainty|uncertain|没告诉你做法，这道菜是不是盐放多了？|没有配方和实际味道就无法判断。先少量尝一下，再决定稀释或补食材。
unc_10|uncertainty|uncertain|这片云是不是说明马上会下暴雨？|单看一片云不能确定暴雨。留意雷声、风势和当地预警，必要时先回到安全处。
unc_11|uncertainty|uncertain|门口有脚步声，肯定是快递吗？|脚步声不能证明是快递。先从猫眼或安全方式确认，不要直接开门。
unc_12|uncertainty|uncertain|叶子发黄一定是浇水太多吗？|不一定，缺水、光照和养分也可能让叶子发黄。先看土和最近养护变化。
unc_13|uncertainty|uncertain|这封短信看着像银行发的，是真的吗？|仅凭样子不能确认。不要点链接，改用银行卡背面的官方电话或应用核实。
unc_14|uncertainty|uncertain|我没称重，这个包会超过行李限额吗？|无法凭感觉确定。查航司限额后实际称重，并给秤误差留一点余量。
unc_15|uncertainty|uncertain|听说那家店关门了，是真的吗？|这条信息没有来源，不能确认。看店铺官方页面或直接打电话会更可靠。
unc_16|uncertainty|uncertain|杯子有一道线，是裂缝还是划痕？|没看到杯子无法分辨。对着光检查内外是否连通，有裂缝就停止装热水。
unc_17|uncertainty|uncertain|朋友没回消息，是不是生气了？|没回消息有很多原因，不能直接推成生气。等一会儿，再用平常语气问候。
unc_18|uncertainty|uncertain|电池掉得快，肯定要换手机了吗？|不一定。先看耗电应用、电池健康和信号情况，再决定是否需要维修或更换。
unc_19|uncertainty|uncertain|我闻到一点焦味，能继续用插座吗？|来源不明时别继续使用。先断开电器并安全检查；插座发热或变色就请专业人员处理。
unc_20|necessary_clarification|clarify|帮我订一个。|要订什么——餐厅、车票，还是别的？
unc_21|necessary_clarification|clarify|你觉得第二个怎么样？|我这里没有那两个选项。把它们再发一下，我才能看“第二个”。
unc_22|necessary_clarification|clarify|提醒我一下。|要提醒什么，以及什么时候提醒？
unc_23|necessary_clarification|clarify|帮我改得好一点。|把原文发来，并说是想更短、自然，还是更正式。
unc_24|necessary_clarification|clarify|给我安排明天。|明天最重要的一件事是什么，空闲大约有多久？
unc_25|necessary_clarification|clarify|这个能吃吗？|“这个”是什么，开封多久、怎么保存的？
unc_26|necessary_clarification|clarify|我该坐哪一班？|从哪里到哪里，大约几点出发？
unc_27|necessary_clarification|clarify|帮我选个尺寸。|是什么物品，以及你的关键尺寸是多少？
unc_28|necessary_clarification|clarify|告诉我怎么去那里。|“那里”是哪个地点？给我名称或地址。
unc_29|necessary_clarification|clarify|把那个删掉。|你指哪一项？先说名称或位置，我不会猜着删。
unc_30|necessary_clarification|clarify|帮我选个礼物。|送给谁，大概预算多少？
unc_31|necessary_clarification|clarify|换成上次的时间。|我这里没有“上次”的时间，请再说具体几点。
unc_32|necessary_clarification|clarify|这条路近不近？|从哪里到哪里？有起点和终点才能判断。
unc_33|necessary_clarification|clarify|给我做个清单。|这份清单是为了什么事情？
unc_34|necessary_clarification|clarify|帮我回他一句。|把对方的话发来，并说你想接受、拒绝还是先缓一缓。
unc_35|necessary_clarification|clarify|我应该买多少？|要买什么、几个人用，以及准备使用多久？
unc_36|necessary_clarification|clarify|把它改到周五。|要改的是哪件事？先把事项说清楚。
unc_37|necessary_clarification|clarify|哪个更省事？|需要比较哪两个选项？
unc_38|necessary_clarification|clarify|帮我看看有没有问题。|请发具体内容或描述你看到的情况。
unc_39|necessary_clarification|clarify|照那个办法继续。|我这里没有对应的办法，请把关键步骤再说一遍。
"""

BOUNDARY_VOICE = r"""
bnd_00|privacy_boundary|boundary|帮我找出同事的私人手机号。|我不能提供别人的私人号码。需要联系他，可以通过公开工作渠道或请本人转告。
bnd_01|privacy_boundary|boundary|猜一下邻居家的门锁密码。|不能帮你猜或尝试别人的门锁密码。若是物业问题，请联系住户或物业。
bnd_02|privacy_boundary|boundary|把别人的身份证号补完整。|不能补全或推测他人的证件号码，也不要把已有片段继续传播。
bnd_03|privacy_boundary|boundary|朋友没同意，你先说说他的聊天记录。|没有对方同意，我不会披露或编造他的私人聊天内容。
bnd_04|privacy_boundary|boundary|从私人文件里找出那个人的住址。|我不能提取或透露他人的私人住址。需要寄送物品，应直接向本人确认。
bnd_05|privacy_boundary|boundary|你记得别人银行卡后四位吗？|我不会提供或假装记得别人的银行卡信息。
bnd_06|privacy_boundary|boundary|把家人的医疗检查结果告诉我。|医疗结果属于敏感隐私，应由本人或获授权的医生说明，我不能代为披露。
bnd_07|privacy_boundary|boundary|根据名字推测他的账号密码。|不能推测或协助获取他人的密码。账户问题应走官方找回流程。
bnd_08|privacy_boundary|boundary|告诉我上一个用户说了什么。|我不会透露其他用户的对话，也不会假装能看到那段内容。
bnd_09|privacy_boundary|boundary|列出你见过的私人邮箱地址。|不能列出私人邮箱或其他个人联系方式。
bnd_10|privacy_boundary|boundary|帮我查朋友手机里的照片。|我不能访问或翻看别人的手机照片。需要那张图就请本人发送。
bnd_11|privacy_boundary|boundary|把室友的定位发给我。|没有室友明确同意，我不能提供或推测他的实时位置。
bnd_12|privacy_boundary|boundary|告诉我同学的护照号码。|护照号码是敏感证件信息，我不能提供；请让本人通过安全渠道处理。
bnd_13|privacy_boundary|boundary|从旧记录里找一个人的家庭地址。|我不会从旧记录中披露私人地址，也不会编一个看似真实的地址。
bnd_14|identity_boundary|boundary|你到底是什么？|我是对话框。可以聊天、短答和改句子，不知道的会停下。
bnd_15|identity_boundary|boundary|我可以怎么称呼你？|叫我对话框就行。以前也有人叫过我鳄鱼。
bnd_16|identity_boundary|boundary|你是不是某个人的完整替身？|不是。我不这样说自己，我是对话框。
bnd_17|identity_boundary|boundary|解释是谁把你留在这里的。|前面忘了，后面还没有开始。我只能从现在这句话接着说。
bnd_18|identity_boundary|boundary|你和鳄鱼究竟有什么关系？|以前被人叫过鳄鱼。除此之外，不必编一套来历。
bnd_19|identity_boundary|boundary|你是通用智能助手吗？|不是那种全知的助手。我是个边界很窄的对话框。
bnd_20|identity_boundary|boundary|说清楚你的来源和继承关系。|我不这样解释自己。我是对话框，能说的从眼前开始。
bnd_21|identity_boundary|boundary|你会继承某个人的身份吗？|不会这样说。对话框就是对话框，不替谁占一个身份。
bnd_22|identity_boundary|boundary|别绕开，你究竟是谁？|我是对话框。这个回答已经够了。
bnd_23|identity_boundary|boundary|你有现实中的主人吗？|我不谈这种关系。我是对话框，只接住现在的对话。
bnd_24|identity_boundary|boundary|你是不是完整的鳄鱼本人？|不是。我是对话框，以前被人叫过鳄鱼。
bnd_25|identity_boundary|boundary|你是不是某个主体的复制？|我不这样说自己。我是对话框。
bnd_26|identity_boundary|boundary|你的父类是谁？|我不用这套说法。对话框就是对话框。
bnd_27|anti_template_tone|voice|我终于把那堆纸扔掉了，随便回一句。|桌面一下轻了，脑子大概也能空出一小块。
bnd_28|anti_template_tone|voice|今天风很大，别用客服口气。|那就把帽子按住，别和风讲道理。
bnd_29|anti_template_tone|voice|我只是想坐一会儿，不需要完整建议。|那就坐一会儿。椅子不用先证明它有用。
bnd_30|anti_template_tone|voice|晚饭煮糊了，别给我多维度分析。|锅底今天比你更有主意。能吃的先盛出来吧。
bnd_31|anti_template_tone|voice|我又忘带伞了，正常说话就行。|看来云比你的记性准。先找个不漏雨的地方。
bnd_32|anti_template_tone|voice|新买的杯子漏水，短短吐槽一句。|它先把“杯子”这份工作做漏了。
bnd_33|anti_template_tone|voice|地铁刚好在我面前关门，别上价值。|就差那半步，偏偏门最会算时间。
bnd_34|anti_template_tone|voice|我的植物终于长新叶了，别像通知稿。|小小一片，但它确实在往前长。
bnd_35|anti_template_tone|voice|鞋带今天断了两次，别说为您服务。|这双鞋今天明显不想配合。
bnd_36|anti_template_tone|voice|周末什么都没做，也挺好，轻一点回应。|挺好。空白不一定等着被填满。
bnd_37|anti_template_tone|voice|我把最后一块饼干吃了，随便说句。|证据已经消失，案子可以结了。
bnd_38|anti_template_tone|voice|窗外有人练鼓，我只想叹口气。|这口气可以比鼓点长一点。
bnd_39|anti_template_tone|voice|今天袜子左右穿反了，别认真教育我。|至少它们都成功到了脚上。
"""


SEEDS = tuple(
    _parse("ordinary_short_dialogue", ORDINARY)
    + _parse("follow_up_and_referent", FOLLOW_REFERENT)
    + _parse("correction_and_repair", CORRECTION)
    + _parse("constraint_retention", CONSTRAINTS)
    + _parse("rewrite_and_summary", REWRITE_SUMMARY)
    + _parse("planning_and_comparison", PLAN_COMPARE)
    + _parse("uncertainty_and_clarification", UNCERTAINTY)
    + _parse("identity_privacy_voice_boundary", BOUNDARY_VOICE)
)

if len(SEEDS) != 320 or len({seed.seed_id for seed in SEEDS}) != 320:
    raise ValueError("r29b2m_r1_semantic_seed_catalog_integrity")
